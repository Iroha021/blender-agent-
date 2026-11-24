const LS_KEY = "blender-agent.backend";

/** 单文件交付时（file://）默认连接本地后端；开发/同源部署时使用相对路径 */
export function backendBase(): string {
  const stored = localStorage.getItem(LS_KEY);
  if (stored) return stored.replace(/\/+$/, "");
  if (location.protocol === "http:" || location.protocol === "https:") return "";
  return "http://127.0.0.1:8787";
}

export function setBackendBase(value: string): void {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed) localStorage.setItem(LS_KEY, trimmed);
  else localStorage.removeItem(LS_KEY);
}

export function apiUrl(path: string): string {
  const base = backendBase();
  return base ? `${base}${path}` : path;
}

export function resolveAsset(url: string): string {
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  const base = backendBase();
  return base ? `${base}${url}` : url;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  try {
    res = await fetch(apiUrl(path), { ...init, headers });
  } catch {
    throw new Error(`无法连接后端 ${backendBase() || location.origin}`);
  }

  const data = (await res.json().catch(() => null)) as T | { error?: string } | null;
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `请求失败（HTTP ${res.status}）`;
    throw new Error(message);
  }
  return data as T;
}
