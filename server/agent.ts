import { streamChat, type ChatMessage, type ChatTool, type ChatResult, type ToolCall } from "./deepseek";
import type { AgentHub } from "./events";
import type { McpHost } from "./mcp";
import { SYSTEM_PROMPT } from "./prompt";

const MAX_STEPS = 40;
const MAX_HISTORY = 60;
const MAX_TOOL_RESULT_FOR_MODEL = 6000;
const MAX_TOOL_RESULT_FOR_UI = 4000;

const ASK_USER_TOOL: ChatTool = {
  type: "function",
  function: {
    name: "ask_user",
    description:
      "在遇到重要决策或信息不足时向用户提问。问题应简短，并提供 2~4 个可点击的选项。一次只问一个关键问题。",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "要询问用户的问题" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "可点击的选项（可选，2~4 个）",
        },
      },
      required: ["question"],
    },
  },
};

export interface AgentDeps {
  mcp: McpHost;
  hub: AgentHub;
  syncScene: () => Promise<{ ok: boolean; error?: string }>;
}

function isAbortError(err: unknown): boolean {
  const name = (err as Error)?.name ?? "";
  const msg = (err as Error)?.message ?? "";
  return name === "AbortError" || /aborted|已取消|任务已取消/i.test(msg);
}

/** 截断工具输出，避免撑爆上下文 / 前端渲染 */
function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…（已截断，共 ${text.length} 字符）`;
}

/**
 * 最简 Agent：DeepSeek function-calling 循环。
 * 想换工作流 / 换模型时，只需替换本文件（对外接口 run / cancel / reset / busy）。
 */
export class SimpleAgent {
  private history: ChatMessage[] = [];
  private abortController: AbortController | null = null;
  private deps: AgentDeps;

  constructor(deps: AgentDeps) {
    this.deps = deps;
  }

  get busy(): boolean {
    return this.abortController !== null;
  }

  reset(): void {
    this.history = [];
  }

  cancel(): void {
    this.abortController?.abort();
    this.deps.hub.cancelQuestion("任务已取消");
  }

  async run(userText: string): Promise<void> {
    if (this.busy) throw new Error("Agent 正在执行，请稍候或先取消");

    const { hub } = this.deps;
    this.abortController = new AbortController();
    hub.setStatus({ busy: true });
    hub.addEntry({ kind: "user", text: userText });
    this.history.push({ role: "user", content: userText });

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        if (this.abortController.signal.aborted) throw new Error("aborted");

        const result = await this.callModel(this.abortController.signal);
        const calls = result.toolCalls;
        if (calls.length === 0) break;

        for (let i = 0; i < calls.length; i++) {
          try {
            await this.runTool(calls[i]);
          } catch (err) {
            if (isAbortError(err)) {
              for (let j = i + 1; j < calls.length; j++) {
                this.history.push({
                  role: "tool",
                  tool_call_id: calls[j].id,
                  content: "（任务已取消）",
                });
              }
            }
            throw err;
          }
        }
      }
    } catch (err) {
      if (isAbortError(err)) {
        hub.addEntry({ kind: "system", text: "已取消当前任务" });
      } else {
        hub.addEntry({ kind: "error", text: `执行失败：${(err as Error).message}` });
      }
    } finally {
      this.abortController = null;
      hub.setStatus({ busy: false, pendingQuestion: undefined });
    }
  }

  /** 组装发给 DeepSeek 的 tools 数组 */
  private chatTools(): ChatTool[] {
    const tools: ChatTool[] = this.deps.mcp.tools
      .filter((t) => t.name !== "ask_user")
      .map((t) => {
        const schema =
          t.inputSchema && typeof t.inputSchema === "object"
            ? (t.inputSchema as Record<string, unknown>)
            : { type: "object", properties: {} };
        return {
          type: "function" as const,
          function: {
            name: t.name,
            description: (t.description ?? t.name).slice(0, 800),
            parameters: schema.type === "object" ? schema : { type: "object", properties: {} },
          },
        };
      });
    tools.push(ASK_USER_TOOL);
    return tools;
  }

  /** 历史裁剪：保留 system + 最近若干条，并从 user 消息处开始，避免孤立 tool 消息 */
  private messages(): ChatMessage[] {
    const history = this.history;
    let tail: ChatMessage[] = history;
    if (history.length > MAX_HISTORY) {
      let start = history.length - MAX_HISTORY;
      while (start < history.length && history[start].role !== "user") start++;
      tail = history.slice(start);
    }
    return [{ role: "system", content: SYSTEM_PROMPT }, ...tail];
  }

  private async callModel(signal: AbortSignal): Promise<ChatResult> {
    const hub = this.deps.hub;
    let thinkingId: string | null = null;
    let assistantId: string | null = null;

    try {
      const result = await streamChat({
        messages: this.messages(),
        tools: this.chatTools(),
        signal,
        onReasoning: (text) => {
          if (!thinkingId) {
            thinkingId = hub.addEntry({ kind: "thinking", text: "", streaming: true }).id;
          }
          hub.delta(thinkingId, text);
        },
        onContent: (text) => {
          if (!assistantId) {
            assistantId = hub.addEntry({ kind: "assistant", text: "", streaming: true }).id;
          }
          hub.delta(assistantId, text);
        },
      });

      if (thinkingId) hub.patch(thinkingId, { streaming: false });
      if (assistantId) hub.patch(assistantId, { streaming: false });

      this.history.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.toolCalls.length ? result.toolCalls : undefined,
      });

      return result;
    } catch (err) {
      if (thinkingId) hub.patch(thinkingId, { streaming: false });
      if (assistantId) hub.patch(assistantId, { streaming: false });
      throw err;
    }
  }

  private async runTool(call: ToolCall): Promise<void> {
    const { hub, mcp } = this.deps;
    const name = call.function.name;

    let args: Record<string, unknown> = {};
    try {
      args = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
    } catch {
      hub.addEntry({
        kind: "tool",
        text: "",
        toolName: name,
        args: call.function.arguments,
        status: "error",
        result: "工具参数 JSON 解析失败",
      });
      this.history.push({
        role: "tool",
        tool_call_id: call.id,
        content: "工具参数 JSON 解析失败，请检查参数格式。",
      });
      return;
    }

    if (name === "ask_user") {
      const question = String(args.question ?? "").trim() || "请补充更多信息";
      const options = Array.isArray(args.options)
        ? args.options.map(String).filter(Boolean).slice(0, 5)
        : undefined;
      try {
        const answer = await hub.askUser(question, options);
        this.history.push({
          role: "tool",
          tool_call_id: call.id,
          content: `用户回答：${answer}`,
        });
      } catch (err) {
        this.history.push({ role: "tool", tool_call_id: call.id, content: "（用户未回答）" });
        throw err;
      }
      return;
    }

    const entry = hub.addEntry({
      kind: "tool",
      text: "",
      toolName: name,
      args,
      status: "running",
    });
    const started = Date.now();

    try {
      const text = await mcp.callTool(name, args);
      const durationMs = Date.now() - started;
      hub.patch(entry.id, {
        status: "ok",
        result: truncate(text, MAX_TOOL_RESULT_FOR_UI),
        durationMs,
      });
      hub.setStatus({ blender: "connected" });
      this.history.push({
        role: "tool",
        tool_call_id: call.id,
        content: truncate(text, MAX_TOOL_RESULT_FOR_MODEL),
      });

      const readOnly = mcp.findTool(name)?.annotations?.readOnlyHint === true;
      if (!readOnly) {
        await this.deps.syncScene();
      }
    } catch (err) {
      const message = (err as Error).message;
      hub.patch(entry.id, { status: "error", result: truncate(message, MAX_TOOL_RESULT_FOR_UI), durationMs: Date.now() - started });
      if (/conectar|connect|socket|Blender/i.test(message)) {
        hub.setStatus({ blender: "error", mcpError: message });
      }
      this.history.push({
        role: "tool",
        tool_call_id: call.id,
        content: `工具执行失败：${message}`,
      });
    }
  }
}
