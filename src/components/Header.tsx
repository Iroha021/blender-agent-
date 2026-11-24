import { useState } from "react";
import { RotateCw, Settings2, Sparkles } from "lucide-react";
import type { AgentStatus, ConnState } from "../../shared/types";

const DOT: Record<ConnState, string> = {
  connected: "bg-emerald-400",
  connecting: "bg-amber-400 animate-pulse",
  error: "bg-rose-500",
  unknown: "bg-neutral-600",
};

function Pill({
  label,
  state,
  title,
  hint,
}: {
  label: string;
  state: ConnState;
  title?: string;
  hint?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.02] px-2 py-0.5 text-[11px] text-neutral-400"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} />
      {label}
      {hint ? <span className="text-neutral-600">{hint}</span> : null}
    </span>
  );
}

interface HeaderProps {
  status: AgentStatus;
  onReconnect: () => Promise<void>;
  onOpenSettings: () => void;
}

export function Header({ status, onReconnect, onOpenSettings }: HeaderProps) {
  const [reconnecting, setReconnecting] = useState(false);

  const reconnect = async () => {
    setReconnecting(true);
    try {
      await onReconnect();
    } finally {
      setReconnecting(false);
    }
  };

  const mcpTooltip = status.mcpError
    ? status.mcpError
    : status.mcp === "connected"
      ? `MCP server 已连接 · ${status.tools} 个工具`
      : "MCP server 连接中…";

  return (
    <header className="flex h-12 shrink-0 items-center gap-4 border-b border-white/5 bg-[#0a0a0c] px-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500 text-[#0b0b0d]">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold tracking-wide text-neutral-100">
            Blender Agent
          </span>
          {status.project ? (
            <span className="max-w-[220px] truncate text-[11px] text-neutral-500">
              · {status.project}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 items-center gap-1.5">
        <Pill
          label="MCP"
          state={status.mcp}
          title={mcpTooltip}
          hint={status.mcp === "connected" ? `${status.tools} tools` : undefined}
        />
        <Pill
          label="Blender"
          state={status.blender}
          title={
            status.blender === "connected"
              ? "Blender 插件已连接（socket 9876）"
              : "Blender 未连接：打开 Blender，启用 blender-mcp-ultra 插件并点击 Connect"
          }
        />
        <Pill
          label="DeepSeek"
          state={status.deepseek ? "connected" : "error"}
          title={
            status.deepseek
              ? `DeepSeek 已配置 · ${status.model}`
              : "未配置 DEEPSEEK_API_KEY，请在 .env 中填写后重启后端"
          }
          hint={status.deepseek ? status.model : "未配置"}
        />
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          title="重新连接 MCP server"
          onClick={() => void reconnect()}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200 disabled:opacity-40"
          disabled={reconnecting}
        >
          <RotateCw className={`h-3.5 w-3.5 ${reconnecting ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          title="设置（后端地址）"
          onClick={onOpenSettings}
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
