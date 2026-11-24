/** 前后端共享的事件与状态类型 */

export type EntryKind =
  | "user"
  | "assistant"
  | "thinking"
  | "tool"
  | "question"
  | "system"
  | "error";

export interface TimelineEntry {
  id: string;
  ts: number;
  kind: EntryKind;
  text: string;
  /** 流式输出中 */
  streaming?: boolean;
  toolName?: string;
  args?: unknown;
  status?: "running" | "ok" | "error";
  result?: string;
  options?: string[];
  answer?: string;
  durationMs?: number;
}

export interface PendingQuestion {
  id: string;
  question: string;
  options?: string[];
}

export type ConnState = "connecting" | "connected" | "error" | "unknown";

export interface AgentStatus {
  mcp: ConnState;
  mcpError?: string;
  tools: number;
  blender: ConnState;
  deepseek: boolean;
  model: string;
  busy: boolean;
  pendingQuestion?: PendingQuestion;
  project?: string | null;
}

export interface SceneInfo {
  url: string;
  version: number;
  at: number;
}

export type ServerEvent =
  | { type: "snapshot"; entries: TimelineEntry[]; status: AgentStatus; scene?: SceneInfo | null }
  | { type: "entry"; entry: TimelineEntry }
  | { type: "delta"; id: string; text: string }
  | { type: "patch"; id: string; patch: Partial<TimelineEntry> }
  | { type: "status"; status: AgentStatus }
  | { type: "scene"; scene: SceneInfo }
  | { type: "clear" };

export interface ProjectFile {
  name: string;
  size: number;
  mtime: number;
  active?: boolean;
}

export interface ApiError {
  error: string;
}
