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

export function sceneFileInfo(): { exists: boolean; mtime: number } {
  try {
    return { exists: true, mtime: fs.statSync(SYNC_FILE).mtimeMs };
  } catch {
    return { exists: false, mtime: 0 };
  }
}

/**
 * 从 Blender 导出当前场景为 GLB，并广播给前端 Three.js 预览。
 * 使用 blender-mcp-ultra 的 registry 工具 io.export_gltf。
 */
export async function syncScene(mcp: McpHost, hub: AgentHub): Promise<SyncResult> {
  if (syncing) return syncing;
  syncing = (async (): Promise<SyncResult> => {
    try {
      fs.mkdirSync(SYNC_DIR, { recursive: true });
      const text = await mcp.callTool(
        "tool_execute",
        {
          tool_name: "io.export_gltf",
          params: { filepath: SYNC_FILE, format: "GLB" },
        },
        60_000
      );

      let success = true;
      let error: string | undefined;
      try {
        const parsed = JSON.parse(text) as { success?: boolean; error?: string };
        if (parsed.success === false) success = false;
        error = parsed.error;
      } catch {
        /* 非 JSON 输出：以文件是否生成作为判断 */
      }

      const stat = fs.statSync(SYNC_FILE, { throwIfNoEntry: false });
      if (!success || !stat || stat.size === 0) {
        throw new Error(error ?? "GLB 导出失败");
      }

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

/** 用只读工具探测 Blender 是否在线（addon socket :9876） */
export async function probeBlender(mcp: McpHost): Promise<boolean> {
  try {
    const text = await mcp.callTool("get_scene_info", {}, 20_000);
    return text.trim().startsWith("{");
  } catch {
    return false;
  }
}
