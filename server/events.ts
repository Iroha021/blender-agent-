import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type {
  AgentStatus,
  EntryKind,
  PendingQuestion,
  SceneInfo,
  ServerEvent,
  TimelineEntry,
} from "../shared/types";

const MAX_ENTRIES = 500;

interface Pending {
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
}

/**
 * 单例事件中心：保存时间线 / 状态 / 场景版本，并向所有 SSE 客户端广播。
 * Agent、MCP host、文件接口都只通过这里与前端通信。
 */
export class AgentHub {
  private entries: TimelineEntry[] = [];
  private clients = new Set<Response>();
  private pending: Pending | null = null;
  private pendingQuestion: PendingQuestion | null = null;

  readonly status: AgentStatus = {
    mcp: "connecting",
    tools: 0,
    blender: "unknown",
    deepseek: false,
    model: "",
    busy: false,
  };

  scene: SceneInfo | null = null;

  addClient(res: Response): void {
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    this.clients.add(res);
    this.writeEvent(res, {
      type: "snapshot",
      entries: this.entries,
      status: this.status,
      scene: this.scene,
    });

    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  private writeEvent(res: Response, event: ServerEvent): void {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  broadcast(event: ServerEvent): void {
    for (const client of this.clients) this.writeEvent(client, event);
  }

  heartbeat(): void {
    for (const client of this.clients) {
      try {
        client.write(": ping\n\n");
      } catch {
        this.clients.delete(client);
      }
    }
  }

  setStatus(patch: Partial<AgentStatus>): void {
    Object.assign(this.status, patch);
    this.broadcast({ type: "status", status: this.status });
  }

  addEntry(input: {
    kind: EntryKind;
    text?: string;
    streaming?: boolean;
    toolName?: string;
    args?: unknown;
    status?: TimelineEntry["status"];
    options?: string[];
    result?: string;
  }): TimelineEntry {
    const entry: TimelineEntry = {
      id: randomUUID(),
      ts: Date.now(),
      kind: input.kind,
      text: input.text ?? "",
      streaming: input.streaming ?? false,
      toolName: input.toolName,
      args: input.args,
      status: input.status,
      options: input.options,
      result: input.result,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    this.broadcast({ type: "entry", entry });
    return entry;
  }

  delta(id: string, text: string): void {
    if (!text) return;
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    entry.text += text;
    this.broadcast({ type: "delta", id, text });
  }

  patch(id: string, patch: Partial<TimelineEntry>): void {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) return;
    Object.assign(entry, patch);
    this.broadcast({ type: "patch", id, patch });
  }

  clear(): void {
    this.entries = [];
    this.broadcast({ type: "clear" });
  }

  setScene(scene: SceneInfo): void {
    this.scene = scene;
    this.broadcast({ type: "scene", scene });
  }

  hasPendingQuestion(): boolean {
    return this.pendingQuestion !== null;
  }

  /** 由 ask_user 工具调用：挂起，等待前端 /api/agent/answer */
  askUser(question: string, options?: string[]): Promise<string> {
    if (this.pendingQuestion) {
      throw new Error("已有未回答的问题");
    }
    const entry = this.addEntry({ kind: "question", text: question, options, status: "running" });
    this.pendingQuestion = { id: entry.id, question, options };

    return new Promise<string>((resolve, reject) => {
      this.pending = {
        resolve: (answer) => {
          this.patch(entry.id, { answer, status: "ok" });
          this.pending = null;
          this.pendingQuestion = null;
          this.setStatus({ pendingQuestion: undefined });
          resolve(answer);
        },
        reject: (err) => {
          this.patch(entry.id, { status: "error" });
          this.pending = null;
          this.pendingQuestion = null;
          this.setStatus({ pendingQuestion: undefined });
          reject(err);
        },
      };
      this.setStatus({ pendingQuestion: this.pendingQuestion ?? undefined });
    });
  }

  answerQuestion(answer: string): boolean {
    if (!this.pending) return false;
    const text = answer.trim();
    if (!text) return false;
    this.pending.resolve(text);
    return true;
  }

  cancelQuestion(reason = "已取消"): void {
    if (!this.pending) return;
    this.pending.reject(new Error(reason));
  }
}
