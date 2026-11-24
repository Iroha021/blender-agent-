import fs from "node:fs";
import path from "node:path";
import type { ProjectFile } from "../shared/types";
import { PROJECTS_DIR } from "./config";
import type { McpHost } from "./mcp";

let activeProject: string | null = null;

export function getActiveProject(): string | null {
  return activeProject;
}

export function setActiveProject(name: string | null): void {
  activeProject = name;
}

function isValidName(name: string): boolean {
  if (!name || name !== path.basename(name)) return false;
  if (/[\\/:*?"<>|]/.test(name)) return false;
  if (name.startsWith(".")) return false;
  return name.toLowerCase().endsWith(".blend");
}

function pythonPath(p: string): string {
  return JSON.stringify(p.replace(/\\/g, "/"));
}

/** 通过「Blender MCP」插件的 execute_python 在 Blender 主线程里执行代码 */
async function runPython(mcp: McpHost, code: string): Promise<void> {
  await mcp.callTool("execute_python", { code, timeout: 120 }, 150_000);
}

export function listProjects(): ProjectFile[] {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  return fs
    .readdirSync(PROJECTS_DIR)
    .filter((name) => name.toLowerCase().endsWith(".blend"))
    .map((name) => {
      const stat = fs.statSync(path.join(PROJECTS_DIR, name));
      return {
        name,
        size: stat.size,
        mtime: stat.mtimeMs,
        active: name === activeProject,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

export interface FileOpResult {
  ok: boolean;
  error?: string;
  name?: string;
}

/** 让 Blender 新建并保存工程文件 */
export async function createProject(mcp: McpHost, rawName: string): Promise<FileOpResult> {
  const name = rawName.trim().toLowerCase().endsWith(".blend")
    ? rawName.trim()
    : `${rawName.trim()}.blend`;
  if (!isValidName(name)) return { ok: false, error: "文件名不合法（不能包含 / \\ : * ? \" < > |）" };

  const filepath = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(filepath)) return { ok: false, error: "同名工程已存在" };

  try {
    const code = [
      "import bpy",
      `bpy.ops.wm.save_as_mainfile(filepath=${pythonPath(filepath)})`,
      "result = {'saved': bpy.data.filepath}",
    ].join("\n");
    await runPython(mcp, code);
    activeProject = name;
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function openProject(mcp: McpHost, name: string): Promise<FileOpResult> {
  if (!isValidName(name)) return { ok: false, error: "文件名不合法" };
  const filepath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(filepath)) return { ok: false, error: "工程文件不存在" };

  try {
    const code = [
      "import bpy",
      `bpy.ops.wm.open_mainfile(filepath=${pythonPath(filepath)})`,
      "result = {'opened': bpy.data.filepath}",
    ].join("\n");
    await runPython(mcp, code);
    activeProject = name;
    return { ok: true, name };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function deleteProject(name: string): FileOpResult {
  if (!isValidName(name)) return { ok: false, error: "文件名不合法" };
  const filepath = path.join(PROJECTS_DIR, name);
  if (!fs.existsSync(filepath)) return { ok: false, error: "工程文件不存在" };
  fs.unlinkSync(filepath);
  if (activeProject === name) activeProject = null;
  return { ok: true, name };
}

export function projectPath(name: string): string {
  return path.join(PROJECTS_DIR, name);
}
