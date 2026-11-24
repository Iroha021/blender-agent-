import { useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

interface ComposerProps {
  busy: boolean;
  pending: boolean;
  deepseek: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
}

export function Composer({ busy, pending, deepseek, onSend, onCancel }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending || !deepseek) return;
    setSending(true);
    try {
      await onSend(value);
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch {
      /* 错误由上层 toast 提示，保留输入内容 */
    } finally {
      setSending(false);
    }
  };

  const placeholder = !deepseek
    ? "未配置 DEEPSEEK_API_KEY，请编辑 .env 后重启后端"
    : pending
      ? "回答 AI 的问题（或点击上方选项）…"
      : busy
        ? "AI 正在执行模型操作…"
        : "描述你想创建的模型，例如：一张极简风格的低多边形茶几";

  return (
    <div className="shrink-0 border-t border-white/5 bg-[#0c0c0f] p-3">
      <div
        className={`rounded-lg border bg-white/[0.03] transition focus-within:border-orange-500/40 ${
          pending ? "border-orange-500/30" : "border-white/10"
        }`}
      >
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          onChange={(event) => {
            setText(event.target.value);
            const el = event.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={placeholder}
          className="block max-h-[160px] w-full resize-none bg-transparent px-3 pt-2.5 text-[12.5px] leading-relaxed text-neutral-200 outline-none placeholder:text-neutral-600"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
          <span className="pl-1 text-[10px] text-neutral-600">
            {pending ? "输入回答后发送" : "Enter 发送 · Shift+Enter 换行"}
          </span>
          <div className="flex items-center gap-1.5">
            {busy || pending ? (
              <button
                type="button"
                onClick={onCancel}
                title="取消当前任务"
                className="flex h-7 items-center gap-1 rounded-md border border-white/10 px-2 text-[11px] text-neutral-400 transition hover:border-rose-500/30 hover:text-rose-300"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                取消
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!text.trim() || sending || !deepseek}
              title="发送"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500 text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
            >
              <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
