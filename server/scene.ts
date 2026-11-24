import fs from "node:fs";
import path from "node:path";
import { PROJECTS_DIR } from "./config";
import type { McpHost } from "./mcp";
import type { AgentHub } from "./events";

const SYNC_DIR = path.join(PROJECTS_DIR, ".sync");
const SYNC_FILE = path.join(SYNC_DIR, "scene.glb");

let version = 0;
let lastError: string | null = null;
let syncing: Promise<SyncResult> | null = null;

export interface SyncResult {
  ok: boolean;
  error?: string;
}

/** 把路径转成 Python 字符串字面量（正斜杠，避免 Windows 转义） */
function pythonPath(p: string): string {
  return JSON.stringify(p.replace(/\\/g, "/"));
}

export function sceneFileInfo(): { exists: boolean; mtime: number } {
  try {
    return { exists: true, mtime: fs.statSync(SYNC_FILE).mtimeMs };
  } catch {
    return { exists: false, mtime: 0 };
  }
}

/**
 * 从 Blender 导出当前场景为 GLB，并广播给前端 Three.js 预览。
 * 通过「Blender MCP」插件的 execute_python 调用 bpy.ops.export_scene.gltf。
 */
export async function syncScene(mcp: McpHost, hub: AgentHub): Promise<SyncResult> {
  if (syncing) return syncing;
  syncing = (async (): Promise<SyncResult> => {
    try {
      fs.mkdirSync(SYNC_DIR, { recursive: true });
      const code = [
        "import bpy, os",
        `path = ${pythonPath(SYNC_FILE)}`,
        "os.makedirs(os.path.dirname(path), exist_ok=True)",
        "bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=False)",
        "result = {'exported': path, 'size': os.path.getsize(path)}",
      ].join("\n");
      await mcp.callTool("execute_python", { code, timeout: 120 }, 150_000);

      const stat = fs.statSync(SYNC_FILE, { throwIfNoEntry: false });
      if (!stat || stat.size === 0) throw new Error("GLB 导出失败（文件为空）");

      version += 1;
      lastError = null;
      hub.setStatus({ blender: "connected" });
      hub.setScene({
        url: `/projects/.sync/scene.glb?v=${version}`,
        version,
        at: Date.now(),
      });
      return { ok: true };
    } catch (err) {
      lastError = (err as Error).message;
      hub.setStatus({ blender: "error" });
      return { ok: false, error: lastError };
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

export function getSceneError(): string | null {
  return lastError;
}

/** 用只读工具探测 Blender 是否在线（「Blender MCP」插件 HTTP :9876/mcp） */
export async function probeBlender(mcp: McpHost): Promise<boolean> {
  try {
    const text = await mcp.callTool("scene_get_overview", {}, 20_000);
    return text.trim().startsWith("{");
  } catch {
    return false;
  }
}
