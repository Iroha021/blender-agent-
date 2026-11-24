import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  CircleHelp,
  Info,
  Loader2,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import type { TimelineEntry } from "../../shared/types";

interface EntryProps {
  entry: TimelineEntry;
  pending: boolean;
  onAnswer: (text: string) => void;
}

function formatDuration(ms?: number): string | null {
  if (ms == null) return null;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function ToolIcon({ status }: { status?: TimelineEntry["status"] }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" />;
  if (status === "ok") return <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  if (status === "error") return <X className="h-3.5 w-3.5 shrink-0 text-rose-400" />;
  return <Wrench className="h-3.5 w-3.5 shrink-0 text-neutral-500" />;
}

function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function TimelineEntryView({ entry, pending, onAnswer }: EntryProps) {
  const [thinkingOpen, setThinkingOpen] = useState(true);

  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm border border-orange-500/20 bg-orange-500/[0.09] px-3 py-2 text-[12.5px] leading-relaxed text-neutral-100">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div className="pr-2">
        <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-orange-400/80">
          AI
        </div>
        <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-200">
          {entry.text}
          {entry.streaming ? (
            <span className="ml-0.5 inline-block h-3.5 w-[3px] animate-pulse bg-orange-400 align-middle" />
          ) : null}
        </div>
      </div>
    );
  }

  if (entry.kind === "thinking") {
    return (
      <div className="rounded-md border border-white/[0.04] bg-white/[0.015] px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setThinkingOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 text-[11px] text-neutral-500 transition hover:text-neutral-300"
        >
          <Brain className="h-3 w-3" />
          思考过程
          {entry.streaming ? <Loader2 className="h-3 w-3 animate-spin text-neutral-600" /> : null}
          <ChevronDown
            className={`ml-auto h-3 w-3 transition ${thinkingOpen ? "rotate-180" : ""}`}
          />
        </button>
        {thinkingOpen ? (
          <pre className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-neutral-500">
            {entry.text}
            {entry.streaming ? (
              <span className="ml-0.5 inline-block h-3 w-[3px] animate-pulse bg-neutral-500 align-middle" />
            ) : null}
          </pre>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "tool") {
    const duration = formatDuration(entry.durationMs);
    return (
      <div
        className={`rounded-lg border px-2.5 py-2 ${
          entry.status === "error"
            ? "border-rose-500/20 bg-rose-500/[0.04]"
            : "border-white/[0.06] bg-white/[0.02]"
        }`}
      >
        <div className="flex items-center gap-2">
          <ToolIcon status={entry.status} />
          <span className="truncate font-mono text-[11.5px] text-neutral-300">
            {entry.toolName ?? "tool"}
          </span>
          <span className="ml-auto shrink-0 text-[10px] text-neutral-600">
            {entry.status === "running" ? "执行中…" : duration}
          </span>
        </div>

        {entry.args !== undefined ? (
          <details className="mt-1.5">
            <summary className="cursor-pointer select-none text-[10.5px] text-neutral-600 hover:text-neutral-400">
              参数
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-mono text-[10.5px] leading-relaxed text-neutral-500">
              {pretty(entry.args).slice(0, 1500)}
            </pre>
          </details>
        ) : null}

        {entry.result ? (
          <details className="mt-1" open={entry.status === "error"}>
            <summary className="cursor-pointer select-none text-[10.5px] text-neutral-600 hover:text-neutral-400">
              输出
            </summary>
            <pre
              className={`mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded p-2 font-mono text-[10.5px] leading-relaxed ${
                entry.status === "error"
                  ? "bg-rose-950/30 text-rose-300/90"
                  : "bg-black/30 text-neutral-500"
              }`}
            >
              {entry.result.slice(0, 4000)}
            </pre>
          </details>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "question") {
    return (
      <div className="rounded-lg border border-orange-500/25 bg-orange-500/[0.05] p-3">
        <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wider text-orange-300/90">
          <CircleHelp className="h-3.5 w-3.5" />
          AI 询问
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-100">
          {entry.text}
        </p>

        {entry.answer ? (
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-emerald-300">
            <Check className="mt-0.5 h-3 w-3 shrink-0" />
            {entry.answer}
          </p>
        ) : entry.options?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={!pending}
                onClick={() => onAnswer(option)}
                className="rounded-md border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[11.5px] text-orange-200 transition hover:bg-orange-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {option}
              </button>
            ))}
          </div>
        ) : pending ? (
          <p className="mt-2 text-[11px] text-neutral-500">在下方输入框回答…</p>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "error") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-2.5 py-2 text-[12px] leading-relaxed text-rose-300">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-pre-wrap break-words">{entry.text}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5 text-[10.5px] text-neutral-600">
      {entry.text.includes("取消") ? (
        <TriangleAlert className="h-3 w-3" />
      ) : (
        <Info className="h-3 w-3" />
      )}
      {entry.text}
    </div>
  );
}
