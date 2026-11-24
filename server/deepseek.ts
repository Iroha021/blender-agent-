import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL } from "./config";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
}

export function deepseekConfigured(): boolean {
  return DEEPSEEK_API_KEY.length > 0;
}

interface StreamOptions {
  messages: ChatMessage[];
  tools: ChatTool[];
  signal?: AbortSignal;
  onContent?: (text: string) => void;
  onReasoning?: (text: string) => void;
  model?: string;
  temperature?: number;
}

/**
 * 极简 DeepSeek Chat Completions 流式客户端（OpenAI 兼容协议）。
 * 仅做：SSE 解析、content/reasoning 回调、tool_calls 增量拼接。
 */
export async function streamChat(opts: StreamOptions): Promise<ChatResult> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("未配置 DEEPSEEK_API_KEY（见 .env）");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: opts.model ?? DEEPSEEK_MODEL,
        messages: opts.messages,
        tools: opts.tools.length ? opts.tools : undefined,
        tool_choice: opts.tools.length ? "auto" : undefined,
        stream: true,
        temperature: opts.temperature ?? 0.3,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`DeepSeek API ${res.status}：${body.slice(0, 500)}`);
    }
    if (!res.body) throw new Error("DeepSeek API 返回了空响应体");

    let content = "";
    let reasoning = "";
    const toolCalls = new Map<number, ToolCall>();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") return;

      let parsed: {
        choices?: Array<{
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        return;
      }

      const delta = parsed.choices?.[0]?.delta;
      if (!delta) return;

      if (delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        opts.onReasoning?.(delta.reasoning_content);
      }
      if (delta.content) {
        content += delta.content;
        opts.onContent?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const existing = toolCalls.get(tc.index) ?? {
          id: tc.id ?? "",
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.function.name += tc.function.name;
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        toolCalls.set(tc.index, existing);
      }
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
      }
    }
    if (buffer) handleLine(buffer);

    return {
      content,
      reasoning,
      toolCalls: [...toolCalls.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, tc]) => tc)
        .filter((tc) => tc.function.name.length > 0),
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
