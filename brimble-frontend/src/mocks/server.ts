import { mockStore } from "./store";
import type { CreateDeploymentInput, LogLine } from "../lib/types";

const DEFAULT_PREFIX = "/api";

export function installMockServer(apiPrefix: string = DEFAULT_PREFIX): void {
  patchFetch(apiPrefix);
  patchEventSource(apiPrefix);
}

function patchFetch(prefix: string) {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const req = toRequest(input, init);
    const url = new URL(req.url, window.location.origin);
    if (!url.pathname.startsWith(prefix)) {
      return original(input as RequestInfo, init);
    }
    const path = url.pathname.slice(prefix.length) || "/";
    try {
      const res = await route(path, req);
      if (res) return res;
    } catch (e) {
      const message = e instanceof Error ? e.message : "internal error";
      return jsonResponse({ error: message }, 500);
    }
    return original(input as RequestInfo, init);
  };
}

async function route(path: string, req: Request): Promise<Response | null> {
  const m = path.match(
    /^\/deployments(?:\/([^/]+)(?:\/(redeploy|logs(?:\/stream)?))?)?\/?$/,
  );
  if (!m) return null;
  const [, id, sub] = m;
  const method = req.method.toUpperCase();

  if (!id) {
    if (method === "GET") return jsonResponse(mockStore.list());
    if (method === "POST") {
      const input = await readCreateInput(req);
      return jsonResponse(mockStore.create(input), 201);
    }
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  if (!sub) {
    if (method === "GET") {
      const d = mockStore.get(id);
      return d ? jsonResponse(d) : jsonResponse({ error: "not found" }, 404);
    }
    if (method === "PATCH") {
      const body = (await req.json().catch(() => ({}))) as {
        env?: Record<string, string>;
      };
      if (body.env && typeof body.env === "object") {
        try {
          return jsonResponse(mockStore.updateEnv(id, body.env));
        } catch (e) {
          const message = e instanceof Error ? e.message : "internal";
          return jsonResponse({ error: message }, 404);
        }
      }
      return jsonResponse({ error: "no supported fields in body" }, 400);
    }
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  if (sub === "redeploy" && method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { buildId?: string };
    try {
      return jsonResponse(mockStore.redeploy(id, body.buildId));
    } catch (e) {
      const message = e instanceof Error ? e.message : "internal";
      return jsonResponse({ error: message }, 400);
    }
  }

  // /logs/stream is handled by the EventSource interceptor; nothing to do here.
  return null;
}

async function readCreateInput(req: Request): Promise<CreateDeploymentInput> {
  const ctype = req.headers.get("content-type") ?? "";
  if (
    ctype.includes("multipart/form-data") ||
    ctype.includes("application/x-www-form-urlencoded")
  ) {
    const form = await req.formData();
    const envRaw = form.get("env");
    const env = typeof envRaw === "string" ? safeJson(envRaw) : {};
    const file = form.get("file");
    return {
      name: (form.get("name") as string) || undefined,
      gitUrl: (form.get("gitUrl") as string) || undefined,
      branch: (form.get("branch") as string) || undefined,
      file: file instanceof File ? file : null,
      env,
    };
  }
  const body = (await req.json().catch(() => ({}))) as Partial<CreateDeploymentInput>;
  return { env: {}, ...body };
}

function safeJson(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) return init ? new Request(input, init) : input;
  return new Request(input.toString(), init);
}

function patchEventSource(prefix: string) {
  const Original = window.EventSource;
  const logsRe = new RegExp(
    `^${escapeRe(prefix)}/deployments/([^/]+)/logs/stream/?$`,
  );

  class MockEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSED = 2;

    readyState = 0;
    url: string;
    withCredentials: boolean;
    onopen: ((ev: Event) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;

    private listeners = new Map<string, Set<EventListener>>();
    private unsubscribe?: () => void;
    private closed = false;

    constructor(url: string | URL, init?: EventSourceInit) {
      this.url = url.toString();
      this.withCredentials = init?.withCredentials ?? false;
      const parsed = new URL(this.url, window.location.origin);
      const m = parsed.pathname.match(logsRe);
      if (!m) {
        return new Original(url, init) as unknown as MockEventSource;
      }
      queueMicrotask(() => this.start(m[1]));
    }

    private start(id: string) {
      if (this.closed) return;
      this.readyState = 1;
      this.fire("open", new Event("open"));
      for (const line of mockStore.getLogs(id)) this.emit(line);
      this.unsubscribe = mockStore.subscribeLogs(id, (line) => this.emit(line));
    }

    private emit(line: LogLine) {
      if (this.closed) return;
      const data = JSON.stringify(line);
      this.fire("log", new MessageEvent("log", { data }));
      this.fire("message", new MessageEvent("message", { data }));
    }

    private fire(type: string, ev: Event) {
      if (type === "open" && this.onopen) this.onopen(ev);
      if (type === "message" && this.onmessage) this.onmessage(ev as MessageEvent);
      if (type === "error" && this.onerror) this.onerror(ev);
      this.listeners.get(type)?.forEach((l) => l(ev));
    }

    addEventListener(type: string, listener: EventListener): void {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(listener);
    }

    removeEventListener(type: string, listener: EventListener): void {
      this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(_ev: Event): boolean {
      return true;
    }

    close(): void {
      this.closed = true;
      this.readyState = 2;
      this.unsubscribe?.();
    }
  }

  window.EventSource = MockEventSource as unknown as typeof EventSource;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
