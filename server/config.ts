import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECTS_DIR = path.join(ROOT, "projects");
export const CONFIG_DIR = path.join(ROOT, "config");
export const DIST_DIR = path.join(ROOT, "dist");

export const PORT = Number(process.env.PORT ?? 8787);
export const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY ?? "").trim();
export const DEEPSEEK_MODEL = (process.env.DEEPSEEK_MODEL ?? "deepseek-chat").trim();
export const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com")
  .trim()
  .replace(/\/+$/, "");

export interface McpServerConfig {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
}

function expandEnv(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, name: string) => {
    const v = process.env[name];
    if (v === undefined || v === "") {
      throw new Error(
        `config/mcp.json 引用了未设置的环境变量 ${name}，请在 .env 中配置（示例见 .env.example）`
      );
    }
    return v;
  });
}

/** 读取 config/mcp.json —— 标准 MCP servers 配置格式，只取第一个 server */
export function loadMcpConfig(): McpServerConfig {
  const file = path.join(CONFIG_DIR, "mcp.json");
  if (!fs.existsSync(file)) throw new Error(`缺少 MCP 配置文件：${file}`);

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`config/mcp.json 解析失败：${(err as Error).message}`);
  }

  const servers = (raw as { mcpServers?: Record<string, Partial<McpServerConfig>> }).mcpServers;
  if (!servers || Object.keys(servers).length === 0) {
    throw new Error("config/mcp.json 中没有 mcpServers 配置");
  }

  const [name, server] = Object.entries(servers)[0];
  if (!server.command) throw new Error(`MCP server "${name}" 缺少 command 字段`);

  const expandRecord = (rec?: Record<string, string>) =>
    rec ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, expandEnv(String(v))])) : {};

  return {
    command: expandEnv(server.command),
    args: (server.args ?? []).map((a) => expandEnv(String(a))),
    cwd: server.cwd ? expandEnv(server.cwd) : undefined,
    env: expandRecord(server.env),
    timeoutMs: Number(server.timeoutMs ?? 120_000),
  };
}
