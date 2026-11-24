import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { SimpleAgent } from "./agent";
import { DEEPSEEK_MODEL, DIST_DIR, PORT, PROJECTS_DIR } from "./config";
import { deepseekConfigured } from "./deepseek";
import { AgentHub } from "./events";
import { createProject, deleteProject, getActiveProject, listProjects, openProject } from "./files";
import { McpHost } from "./mcp";
import { probeBlender, syncScene } from "./scene";

const hub = new AgentHub();
hub.status.deepseek = deepseekConfigured();
hub.status.model = DEEPSEEK_MODEL;

const mcp = new McpHost();
const agent = new SimpleAgent({
  mcp,
  hub,
  syncScene: () => syncScene(mcp, hub),
});

/* ---------------------------------- MCP ---------------------------------- */

async function connectMcp(): Promise<void> {
  hub.setStatus({ mcp: "connecting", mcpError: undefined, tools: 0 });
  try {
    await mcp.connect();
    hub.setStatus({ mcp: "connected", tools: mcp.tools.length, mcpError: undefined });
    const online = await probeBlender(mcp);
    hub.setStatus({ blender: online ? "connected" : "error" });
    if (online) await syncScene(mcp, hub);
    console.log(`[mcp] connected: ${mcp.tools.length} tools`);
  } catch (err) {
    const message = (err as Error).message;
    hub.setStatus({ mcp: "error", mcpError: message, tools: 0 });
    console.error("[mcp] connect failed:", message);
  }
}

void connectMcp();

/* --------------------------------- Server -------------------------------- */

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/status", (_req, res) => {
  res.json({ ...hub.status, project: getActiveProject() });
});

app.get("/api/events", (req, res) => {
  hub.addClient(res);
  req.on("close", () => res.end());
});

app.post("/api/mcp/reconnect", async (_req, res) => {
  await mcp.close();
  await connectMcp();
  res.json({ ok: mcp.state === "connected", ...hub.status });
});

app.post("/api/sync", async (_req, res) => {
  const result = await syncScene(mcp, hub);
  res.status(result.ok ? 200 : 502).json({ ...result, blender: hub.status.blender });
});

app.post("/api/agent/message", (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }
  if (hub.hasPendingQuestion()) {
    hub.answerQuestion(text);
    res.json({ ok: true });
    return;
  }
  if (agent.busy) {
    res.status(409).json({ error: "Agent 正在执行，请稍候或先取消" });
    return;
  }
  if (!deepseekConfigured()) {
    res.status(400).json({ error: "未配置 DEEPSEEK_API_KEY，请在 .env 中填写后重启后端" });
    return;
  }
  if (mcp.state !== "connected") {
    res.status(503).json({ error: `MCP server 未就绪：${mcp.error ?? "正在连接…"}` });
    return;
  }

  res.json({ ok: true });
  void agent.run(text);
});

app.post("/api/agent/answer", (req, res) => {
  const text = String(req.body?.text ?? "").trim();
  if (!hub.answerQuestion(text)) {
    res.status(409).json({ error: "当前没有等待回答的问题" });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/agent/cancel", (_req, res) => {
  agent.cancel();
  res.json({ ok: true });
});

app.post("/api/agent/reset", (_req, res) => {
  agent.cancel();
  agent.reset();
  hub.clear();
  res.json({ ok: true });
});

app.get("/api/files", (_req, res) => {
  res.json({ files: listProjects() });
});

app.post("/api/files/new", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "缺少工程名" });
    return;
  }
  const result = await createProject(mcp, name);
  if (result.ok) {
    hub.setStatus({ project: result.name ?? null });
    await syncScene(mcp, hub);
  }
  res.status(result.ok ? 200 : 400).json(result);
});

app.post("/api/files/open", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const result = await openProject(mcp, name);
  if (result.ok) {
    hub.setStatus({ project: result.name ?? null });
    await syncScene(mcp, hub);
  }
  res.status(result.ok ? 200 : 400).json(result);
});

app.delete("/api/files/:name", (req, res) => {
  const result = deleteProject(req.params.name);
  if (result.ok) hub.setStatus({ project: getActiveProject() });
  res.status(result.ok ? 200 : 400).json(result);
});

/* -------------------------------- Static --------------------------------- */

fs.mkdirSync(PROJECTS_DIR, { recursive: true });
app.use(
  "/projects",
  express.static(PROJECTS_DIR, {
    dotfiles: "allow",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".glb") || filePath.endsWith(".bin")) {
        res.setHeader("Cache-Control", "no-store");
      }
    },
  })
);

const hasDist = fs.existsSync(path.join(DIST_DIR, "index.html"));
if (hasDist) {
  app.use(express.static(DIST_DIR));
}
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (hasDist) {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  } else {
    res
      .status(503)
      .type("text")
      .send("前端尚未构建：请运行 `npm run dev`（开发）或 `npm run build`（单文件交付）");
  }
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server]", err);
  res.status(500).json({ error: err.message });
});

const heartbeat = setInterval(() => hub.heartbeat(), 20_000);
const blenderPoll = setInterval(async () => {
  if (agent.busy || mcp.state !== "connected") return;
  const online = await probeBlender(mcp);
  if (online !== (hub.status.blender === "connected")) {
    hub.setStatus({ blender: online ? "connected" : "error" });
  }
}, 30_000);

const server = app.listen(PORT, () => {
  console.log(`[server] http://127.0.0.1:${PORT}`);
  console.log(`[server] frontend ${hasDist ? "dist/index.html (single file)" : "未构建 —— 请使用 vite dev"}`);
});

async function shutdown(): Promise<void> {
  clearInterval(heartbeat);
  clearInterval(blenderPoll);
  server.close();
  await mcp.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
