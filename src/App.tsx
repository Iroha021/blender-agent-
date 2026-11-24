import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectFile } from "../shared/types";
import { Composer } from "./components/Composer";
import { FilePanel } from "./components/FilePanel";
import { Header } from "./components/Header";
import { ResizableLayout } from "./components/ResizableLayout";
import { SettingsDialog } from "./components/SettingsDialog";
import { Viewport } from "./components/Viewport";
import { WorkflowPanel } from "./components/WorkflowPanel";
import { useAgent } from "./hooks/useAgent";
import { request } from "./lib/api";

export default function App() {
  const agent = useAgent();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const refreshFiles = useCallback(async () => {
    try {
      const result = await request<{ files: ProjectFile[] }>("/api/files");
      setFiles(result.files);
    } catch (err) {
      notify(`读取工程列表失败：${(err as Error).message}`);
    }
  }, [notify]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles, agent.status.project]);

  const handleNew = async (name: string) => {
    await request<{ ok: boolean }>("/api/files/new", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await refreshFiles();
  };

  const handleOpen = async (name: string) => {
    await request<{ ok: boolean }>("/api/files/open", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await refreshFiles();
  };

  const handleDelete = async (name: string) => {
    await request<{ ok: boolean }>(`/api/files/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    await refreshFiles();
  };

  const handleSend = async (text: string) => {
    try {
      if (agent.status.pendingQuestion) await agent.answer(text);
      else await agent.send(text);
    } catch (err) {
      notify((err as Error).message);
      throw err;
    }
  };

  const handleAnswer = async (text: string) => {
    try {
      await agent.answer(text);
    } catch (err) {
      notify((err as Error).message);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await agent.sync();
    } catch (err) {
      notify(`同步失败：${(err as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleReconnect = async () => {
    try {
      await agent.reconnectMcp();
    } catch (err) {
      notify(`重连 MCP 失败：${(err as Error).message}`);
    }
  };

  const handleReset = () => {
    if (!window.confirm("清空当前会话记录？（不影响 Blender 场景与工程文件）")) return;
    void agent.reset().catch((err) => notify((err as Error).message));
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#09090b] text-neutral-300">
      <Header
        status={agent.status}
        onReconnect={handleReconnect}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {!agent.connected ? (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-1 text-center text-[10.5px] text-amber-300/90">
          与后端的事件流已断开，正在自动重连…
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ResizableLayout
          left={
            <FilePanel
              files={files}
              activeProject={agent.status.project}
              busy={agent.status.busy}
              onRefresh={refreshFiles}
              onNew={handleNew}
              onOpen={handleOpen}
              onDelete={handleDelete}
            />
          }
          center={
            <Viewport
              scene={agent.scene}
              blender={agent.status.blender}
              mcp={agent.status.mcp}
              syncing={syncing}
              onSync={() => void handleSync()}
            />
          }
          right={
            <section className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                <WorkflowPanel
                  entries={agent.entries}
                  status={agent.status}
                  connected={agent.connected}
                  onAnswer={(text) => void handleAnswer(text)}
                  onReset={handleReset}
                />
              </div>
              <Composer
                busy={agent.status.busy}
                pending={Boolean(agent.status.pendingQuestion)}
                deepseek={agent.status.deepseek}
                onSend={handleSend}
                onCancel={() => void agent.cancel().catch(() => undefined)}
              />
            </section>
          }
        />
      </div>

      {toast ? (
        <div className="fixed bottom-5 left-1/2 z-50 max-w-[80vw] -translate-x-1/2 rounded-md border border-rose-500/30 bg-rose-950/90 px-3 py-2 text-[11.5px] leading-relaxed text-rose-200 shadow-xl backdrop-blur">
          {toast}
        </div>
      ) : null}

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
