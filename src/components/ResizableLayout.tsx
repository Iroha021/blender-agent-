import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

const LEFT_KEY = "blender-agent.leftWidth";
const RIGHT_KEY = "blender-agent.rightWidth";
const CENTER_MIN = 300;

function readWidth(key: string, fallback: number): number {
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** 三栏布局：左右面板宽度可拖拽并记忆 */
export function ResizableLayout({
  left,
  center,
  right,
}: {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  const [leftWidth, setLeftWidth] = useState(() => readWidth(LEFT_KEY, 264));
  const [rightWidth, setRightWidth] = useState(() => readWidth(RIGHT_KEY, 392));
  const drag = useRef<{ side: "left" | "right"; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(LEFT_KEY, String(leftWidth));
  }, [leftWidth]);

  useEffect(() => {
    localStorage.setItem(RIGHT_KEY, String(rightWidth));
  }, [rightWidth]);

  const startDrag = (side: "left" | "right") => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      side,
      startX: event.clientX,
      startWidth: side === "left" ? leftWidth : rightWidth,
    };
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;

    const delta = event.clientX - state.startX;
    if (state.side === "left") {
      const max = window.innerWidth - rightWidth - CENTER_MIN;
      setLeftWidth(clamp(state.startWidth + delta, 200, Math.min(560, max)));
    } else {
      const max = window.innerWidth - leftWidth - CENTER_MIN;
      setRightWidth(clamp(state.startWidth - delta, 300, Math.min(760, max)));
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const handleClass =
    "group relative w-[5px] shrink-0 cursor-col-resize bg-transparent transition hover:bg-orange-500/30";

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <aside className="flex min-h-0 min-w-0 shrink-0 flex-col" style={{ width: leftWidth }}>
        {left}
      </aside>

      <div
        className={handleClass}
        onPointerDown={startDrag("left")}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.06]" />
      </div>

      <main className="flex min-h-0 min-w-0 flex-1">{center}</main>

      <div
        className={handleClass}
        onPointerDown={startDrag("right")}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.06]" />
      </div>

      <aside className="flex min-h-0 min-w-0 shrink-0 flex-col" style={{ width: rightWidth }}>
        {right}
      </aside>
    </div>
  );
}
