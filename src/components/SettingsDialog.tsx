import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { backendBase, setBackendBase } from "../lib/api";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) return;
    const fallback = location.protocol.startsWith("http")
      ? location.origin
      : "http://127.0.0.1:8787";
    setValue(backendBase() || fallback);
  }, [open]);

  if (!open) return null;

  const save = () => {
    const trimmed = value.trim();
    const isDefault =
      (location.protocol.startsWith("http") && trimmed === location.origin) ||
      (!location.protocol.startsWith("http") && trimmed === "http://127.0.0.1:8787");
    setBackendBase(isDefault ? "" : trimmed);
    location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[420px] rounded-xl border border-white/10 bg-[#101014] p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="设置"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-neutral-200">设置</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <label className="text-[11px] text-neutral-500">后端地址</label>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
          placeholder="http://127.0.0.1:8787"
          className="mt-1.5 w-full rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-orange-500/50"
        />
        <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">
          默认同源访问。若以单文件方式（file://）打开 HTML，需要填写后端地址，例如
          http://127.0.0.1:8787。保存后会重新加载页面。
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-7 rounded-md px-3 text-[11.5px] text-neutral-400 hover:bg-white/5"
          >
            取消
          </button>
          <button
            type="button"
            onClick={save}
            className="h-7 rounded-md bg-orange-500 px-3 text-[11.5px] font-medium text-black hover:bg-orange-400"
          >
            保存并重载
          </button>
        </div>
      </div>
    </div>
  );
}
