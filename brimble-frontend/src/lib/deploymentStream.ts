import { LOG_SEPARATOR, api } from "./api";
import type {
  CreateDeploymentInput,
  LogLine,
  UpdateSourceInput,
} from "./types";

export interface StreamCallbacks {
  onLine: (line: LogLine) => void;
  onError: (err: Error) => void;
  onDone: () => void;
}

export function parseLogLine(raw: string): LogLine | null {
  const stripped = raw.startsWith("data:") ? raw.slice(5).trimStart() : raw;
  if (!stripped) return null;
  const parts = stripped.split(LOG_SEPARATOR);
  if (parts.length < 3) {
    return { ts: Date.now(), level: "INFO", message: stripped };
  }
  const ts = Number(parts[0]);
  return {
    ts: Number.isFinite(ts) ? ts : Date.now(),
    level: parts[1].trim() || "INFO",
    message: parts.slice(2).join(LOG_SEPARATOR),
  };
}

async function consumeLogStream(
  res: Response,
  cb: StreamCallbacks,
): Promise<void> {
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    cb.onError(
      new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`),
    );
    cb.onDone();
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const raw = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        if (raw) {
          const line = parseLogLine(raw);
          if (line) cb.onLine(line);
        }
        nl = buffer.indexOf("\n");
      }
    }
    if (buffer.trim()) {
      const line = parseLogLine(buffer);
      if (line) cb.onLine(line);
    }
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      cb.onError(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    cb.onDone();
  }
}

export async function streamDeployment(
  input: CreateDeploymentInput,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await api.createDeploymentStream(input, signal);
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
    cb.onDone();
    return;
  }
  await consumeLogStream(res, cb);
}

export async function streamEnvUpdate(
  slug: string,
  envText: string,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await api.updateEnvStream(slug, envText, signal);
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
    cb.onDone();
    return;
  }
  await consumeLogStream(res, cb);
}

export async function streamSourceUpdate(
  slug: string,
  input: UpdateSourceInput,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await api.updateSourceStream(slug, input, signal);
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
    cb.onDone();
    return;
  }
  await consumeLogStream(res, cb);
}

export async function streamRollback(
  slug: string,
  imageId: number,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await api.rollbackStream(slug, imageId, signal);
  } catch (err) {
    cb.onError(err instanceof Error ? err : new Error(String(err)));
    cb.onDone();
    return;
  }
  await consumeLogStream(res, cb);
}
