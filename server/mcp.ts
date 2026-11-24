import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ConnState } from "../shared/types";
import { loadMcpConfig, type McpServerConfig } from "./config";

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

export class McpToolError extends Error {
  constructor(
    message: string,
    readonly toolName: string
  ) {
    super(message);
  }
}

/**
 * MCP Host 最小实现：
 * 读取 config/mcp.json → 按 url 连接 Streamable HTTP（如 Blender MCP 插件）
 * 或按 command 启动 stdio server → initialize → listTools → callTool。
 * 只依赖官方 @modelcontextprotocol/sdk，替换 agent / server 时无需改动。
 */
export class McpHost {
  state: ConnState = "connecting";
  error?: string;
  tools: McpToolDef[] = [];
  serverName = "";
  private client: Client | null = null;
  private cfg: McpServerConfig | null = null;

  async connect(): Promise<void> {
    this.state = "connecting";
    this.error = undefined;

    const cfg = loadMcpConfig();
    this.cfg = cfg;

    const transport = cfg.url
      ? new StreamableHTTPClientTransport(new URL(cfg.url))
      : new StdioClientTransport({
          command: cfg.command!,
          args: cfg.args,
          cwd: cfg.cwd,
          env: {
            ...(process.env as Record<string, string>),
            ...cfg.env,
          },
          stderr: "pipe",
        });

    const client = new Client({ name: "blender-agent", version: "0.1.0" });

    transport.onclose = () => {
      this.state = "error";
      this.error = this.error ?? "MCP server 进程已退出";
    };
    transport.onerror = (err) => {
      this.error = err.message;
    };

    await client.connect(transport);
    this.client = client;

    const tools: McpToolDef[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      tools.push(...(page.tools as McpToolDef[]));
      cursor = page.nextCursor;
    } while (cursor);

    this.tools = tools;
    this.state = "connected";
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<string> {
    if (!this.client) throw new McpToolError("MCP server 未连接", name);
    const timeout = timeoutMs ?? this.cfg?.timeoutMs ?? 120_000;

    const call = this.client.callTool({ name, arguments: args }, undefined, { timeout });
    const result = await Promise.race([
      call,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new McpToolError(`工具调用超时（${timeout}ms）`, name)), timeout);
      }),
    ]);

    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");

    if (result.isError) throw new McpToolError(text || "工具执行失败", name);
    return text;
  }

  findTool(name: string): McpToolDef | undefined {
    return this.tools.find((t) => t.name === name);
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      /* ignore */
    }
    this.client = null;
  }
}
