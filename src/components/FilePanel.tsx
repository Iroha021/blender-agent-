import { useRef, useState } from "react";
import { Check, FileBox, FilePlus2, RefreshCw, Trash2, X } from "lucide-react";
import type { ProjectFile } from "../../shared/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(mtime: number): string {
  return new Date(mtime).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface FilePanelProps {
  files: ProjectFile[];
  activeProject?: string | null;
  busy?: boolean;
  onRefresh: () => void | Promise<void>;
  onNew: (name: string) => Promise<void>;
  onOpen: (name: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
}

export function FilePanel({
  files,
  activeProject,
  busy,
  onRefresh,
  onNew,
  onOpen,
  onDelete,
}: FilePanelProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const resetCreate = () => {
    setCreating(false);
    setName("");
    setError(null);
  };

  const submitNew = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending("__new__");
    setError(null);
    try {
      await onNew(trimmed);
      resetCreate();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  };

  const run = async (action: "open" | "delete", fileName: string) => {
    if (action === "delete" && !window.confirm(`删除工程 ${fileName}？\n仅删除磁盘上的 .blend 文件。`)) {
      return;
    }
    setPending(fileName);
    setError(null);
    try {
      if (action === "open") await onOpen(fileName);
      else await onDelete(fileName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            工程文件
          </span>
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-neutral-500">
            {files.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="刷新"
            onClick={() => void onRefresh()}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="新建工程（在 Blender 中保存为新 .blend）"
            disabled={busy || pending === "__new__"}
            onClick={() => {
              setCreating(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-white/5 hover:text-neutral-200 disabled:opacity-40"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {creating ? (
          <div className="mb-2 rounded-md border border-orange-500/20 bg-orange-500/[0.04] p-2">
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitNew();
                if (event.key === "Escape") resetCreate();
              }}
              placeholder="工程名，如 robot-arm"
              className="w-full rounded border border-white/10 bg-black/40 px-2 py-1.5 text-[12px] text-neutral-200 outline-none placeholder:text-neutral-600 focus:border-orange-500/50"
            />
            <div className="mt-1.5 flex justify-end gap-1">
              <button
                type="button"
                onClick={resetCreate}
                className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-neutral-400 hover:bg-white/5"
              >
                <X className="h-3 w-3" /> 取消
              </button>
              <button
                type="button"
                onClick={() => void submitNew()}
                disabled={!name.trim() || pending === "__new__"}
                className="flex h-6 items-center gap-1 rounded bg-orange-500/90 px-2 text-[11px] font-medium text-black hover:bg-orange-400 disabled:opacity-40"
              >
                <Check className="h-3 w-3" /> 创建
              </button>
            </div>
          </div>
        ) : null}

        {files.length === 0 && !creating ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <FileBox className="h-7 w-7 text-neutral-700" />
            <p className="text-[12px] text-neutral-500">还没有工程文件</p>
            <p className="px-4 text-[11px] leading-relaxed text-neutral-600">
              点击右上角 + 新建，或让 AI 直接开始建模
            </p>
          </div>
        ) : null}

        <div className="space-y-0.5">
          {files.map((file) => {
            const active = activeProject === file.name;
            const isPending = pending === file.name;
            return (
              <div
                key={file.name}
                role="button"
                tabIndex={0}
                onClick={() => void run("open", file.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void run("open", file.name);
                }}
                className={`group flex cursor-pointer items-center gap-2 rounded-md border-l-2 px-2 py-1.5 transition ${
                  active
                    ? "border-orange-500 bg-orange-500/[0.07]"
                    : "border-transparent hover:bg-white/[0.04]"
                } ${isPending ? "opacity-50" : ""}`}
              >
                <FileBox
                  className={`h-4 w-4 shrink-0 ${active ? "text-orange-400" : "text-neutral-600"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-neutral-200">{file.name}</div>
                  <div className="text-[10.5px] text-neutral-600">
                    {formatSize(file.size)} · {formatTime(file.mtime)}
                  </div>
                </div>
                <button
                  type="button"
                  title="删除"
                  onClick={(event) => {
                    event.stopPropagation();
                    void run("delete", file.name);
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-600 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {error ? (
        <div className="mx-2 mb-2 rounded border border-rose-500/20 bg-rose-500/[0.06] px-2 py-1.5 text-[11px] leading-snug text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="border-t border-white/5 px-3 py-2 text-[10.5px] leading-relaxed text-neutral-600">
        文件保存在 <span className="text-neutral-500">projects/</span>，由 Blender 保存/打开
      </div>
    </div>
  );
}
