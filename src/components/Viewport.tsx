import { useEffect, useRef, useState } from "react";
import { Box, Grid3x3, Loader2, Maximize2, RefreshCw } from "lucide-react";
import type { ConnState, SceneInfo } from "../../shared/types";
import { resolveAsset } from "../lib/api";
import { SceneViewer, type SceneStats } from "../viewer/SceneViewer";

interface ViewportProps {
  scene: SceneInfo | null;
  blender: ConnState;
  mcp: ConnState;
  syncing: boolean;
  onSync: () => void;
}

export function Viewport({ scene, blender, mcp, syncing, onSync }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const viewer = new SceneViewer(container);
    viewer.onStats = setStats;
    viewer.onLoading = setLoading;
    viewer.onError = (message) => setError(message);
    viewerRef.current = viewer;

    return () => {
      viewerRef.current = null;
      viewer.dispose();
    };
  }, []);

  const url = scene?.url;
  useEffect(() => {
    if (!url) return;
    setError(null);
    void viewerRef.current?.load(resolveAsset(url));
  }, [url]);

  const busy = mcp !== "connected";
  const disconnected = blender !== "connected";

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0b0e]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* 左上：场景统计 */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
        <span className="rounded-md border border-white/5 bg-black/40 px-2 py-1 text-[11px] font-medium text-neutral-300 backdrop-blur">
          3D 预览
        </span>
        {stats ? (
          <span className="rounded-md border border-white/5 bg-black/30 px-2 py-1 text-[10.5px] text-neutral-500 backdrop-blur">
            网格 {stats.meshes} · 面 {stats.triangles.toLocaleString("en-US")}
          </span>
        ) : null}
        {scene ? (
          <span className="rounded-md border border-white/5 bg-black/30 px-2 py-1 text-[10.5px] text-neutral-600 backdrop-blur">
            v{scene.version} · {new Date(scene.at).toLocaleTimeString("zh-CN")}
          </span>
        ) : null}
      </div>

      {/* 右上：操作 */}
      <div className="absolute right-3 top-3 flex items-center gap-1">
        <button
          type="button"
          title={wireframe ? "关闭线框" : "线框显示"}
          onClick={() => {
            setWireframe((value) => {
              viewerRef.current?.setWireframe(!value);
              return !value;
            });
          }}
          className={`flex h-7 w-7 items-center justify-center rounded-md border backdrop-blur transition ${
            wireframe
              ? "border-orange-500/40 bg-orange-500/15 text-orange-300"
              : "border-white/5 bg-black/40 text-neutral-500 hover:text-neutral-200"
          }`}
        >
          <Grid3x3 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="适配视图"
          onClick={() => viewerRef.current?.frameAll()}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-white/5 bg-black/40 text-neutral-500 backdrop-blur transition hover:text-neutral-200"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title={busy ? "MCP 未就绪" : disconnected ? "从 Blender 同步当前场景" : "同步 Blender 场景"}
          disabled={syncing || busy}
          onClick={onSync}
          className="flex h-7 items-center gap-1.5 rounded-md border border-white/5 bg-black/40 px-2 text-[11px] text-neutral-400 backdrop-blur transition hover:text-neutral-200 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          同步
        </button>
      </div>

      {/* 加载中 */}
      {loading || syncing ? (
        <div className="absolute left-1/2 top-14 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/5 bg-black/60 px-3 py-1 text-[11px] text-neutral-300 backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
          {syncing ? "正在从 Blender 导出…" : "加载模型…"}
        </div>
      ) : null}

      {/* 空状态 */}
      {!scene ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <Box className="h-10 w-10 text-neutral-700" />
          <p className="text-[13px] text-neutral-400">等待 Blender 场景</p>
          <p className="max-w-[300px] text-[11.5px] leading-relaxed text-neutral-600">
            {mcp !== "connected"
              ? "后端正在连接 blender-mcp server，请稍候…"
              : disconnected
                ? "Blender 未连接。打开 Blender → 按 N 打开侧边栏 → MCP → Start MCP Server，AI 的每一步操作都会同步到这里。"
                : "在右侧输入建模需求，AI 创建的场景会实时出现在这里。"}
          </p>
        </div>
      ) : null}

      {/* 错误 */}
      {error ? (
        <div className="absolute bottom-12 left-1/2 max-w-[80%] -translate-x-1/2 rounded-md border border-rose-500/20 bg-rose-950/70 px-3 py-1.5 text-[11px] text-rose-300 backdrop-blur">
          预览加载失败：{error}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-2.5 left-3 text-[10.5px] text-neutral-600">
        左键旋转 · 右键平移 · 滚轮缩放
      </div>
    </div>
  );
}
