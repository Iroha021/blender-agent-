import { useCallback, useEffect, useState } from "react";
import type { AgentStatus, SceneInfo, ServerEvent, TimelineEntry } from "../../shared/types";
import { apiUrl, request } from "../lib/api";

const EMPTY_STATUS: AgentStatus = {
  mcp: "connecting",
  tools: 0,
  blender: "unknown",
  deepseek: false,
  model: "",
  busy: false,
};

function applyEvent(
  event: ServerEvent,
  setEntries: React.Dispatch<React.SetStateAction<TimelineEntry[]>>,
  setStatus: React.Dispatch<React.SetStateAction<AgentStatus>>,
  setScene: React.Dispatch<React.SetStateAction<SceneInfo | null>>
): void {
  switch (event.type) {
    case "snapshot":
      setEntries(event.entries);
      setStatus(event.status);
      setScene(event.scene ?? null);
      break;
    case "entry":
      setEntries((prev) => [...prev, event.entry]);
      break;
    case "delta":
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === event.id ? { ...entry, text: entry.text + event.text } : entry
        )
      );
      break;
    case "patch":
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === event.id ? { ...entry, ...event.patch } : entry
        )
      );
      break;
    case "status":
      setStatus(event.status);
      break;
    case "scene":
      setScene(event.scene);
      break;
    case "clear":
      setEntries([]);
      break;
    default:
      break;
  }
}

/** 订阅后端 SSE 事件流，并暴露所有操作动作 */
export function useAgent() {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [status, setStatus] = useState<AgentStatus>(EMPTY_STATUS);
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const es = new EventSource(apiUrl("/api/events"));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (message) => {
      try {
        applyEvent(JSON.parse(message.data) as ServerEvent, setEntries, setStatus, setScene);
      } catch {
        /* ignore malformed event */
      }
    };
    return () => es.close();
  }, []);

  const send = useCallback(async (text: string) => {
    await request<{ ok: boolean }>("/api/agent/message", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }, []);

  const answer = useCallback(async (text: string) => {
    await request<{ ok: boolean }>("/api/agent/answer", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }, []);

  const cancel = useCallback(async () => {
    await request<{ ok: boolean }>("/api/agent/cancel", { method: "POST" });
  }, []);

  const reset = useCallback(async () => {
    await request<{ ok: boolean }>("/api/agent/reset", { method: "POST" });
  }, []);

  const reconnectMcp = useCallback(async () => {
    await request<{ ok: boolean }>("/api/mcp/reconnect", { method: "POST" });
  }, []);

  const sync = useCallback(async () => {
    await request<{ ok: boolean; error?: string }>("/api/sync", { method: "POST" });
  }, []);

  return { entries, status, scene, connected, send, answer, cancel, reset, reconnectMcp, sync };
}
