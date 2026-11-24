import { useEffect, useRef } from "react";
import { Activity, Loader2, Trash2 } from "lucide-react";
import type { AgentStatus, TimelineEntry } from "../../shared/types";
import { TimelineEntryView } from "./TimelineEntryView";

interface WorkflowPanelProps {
  entries: TimelineEntry[];
  status: AgentStatus;
  connected: boolean;
  onAnswer: (text: string) => void;
  onReset: () => void;
}

export function WorkflowPanel({ entries, status, connected, onAnswer, onReset }: WorkflowPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const hasPending = Boolean(status.pendingQuestion);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            AI 工作流
          </span>
          {status.busy ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-300/90">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              {hasPending ? "等待回答" : "执行中"}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <span
            className={`mr-1 h-1.5 w-1.5 rounded-full ${
              connected ? "bg-emerald-400" : "bg-rose-500"
            }`}
            title={connected ? "事件流已连接" : "与后端断开，正在重连…"}
          />
          <button
            type="button"
            title="清空会话"
            onClick={onReset}
            disabled={status.busy}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-600 transition hover:bg-white/5 hover:text-neutral-300 disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
      >
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Activity className="h-7 w-7 text-neutral-700" />
            <p className="text-[12px] text-neutral-500">
              {connected ? "AI 的工作流会显示在这里" : "正在连接后端…"}
            </p>
            <p className="max-w-[240px] text-[11px] leading-relaxed text-neutral-600">
              {connected
                ? "每次推理、工具调用、关键决策询问都会实时展示。你可以在下方输入需求开始。"
                : "若长时间无法连接，请点击右上角设置检查后端地址。"}
            </p>
          </div>
        ) : null}

        {entries.map((entry) => (
          <TimelineEntryView
            key={entry.id}
            entry={entry}
            pending={hasPending && !entry.answer}
            onAnswer={onAnswer}
          />
        ))}
      </div>
    </div>
  );
}
