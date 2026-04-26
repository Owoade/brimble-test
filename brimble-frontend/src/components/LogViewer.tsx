import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Deployment, LogLine } from "../lib/types";
import { api } from "../lib/api";

interface Props {
  deployment: Deployment | null;
}

export function LogViewer({ deployment }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLines([]);
    setStreamError(null);
    setConnected(false);

    if (!deployment) return;

    const url = api.logsUrl(deployment.id);
    const es = new EventSource(url, { withCredentials: false });

    es.onopen = () => setConnected(true);

    const onLine = (raw: string) => {
      try {
        const parsed = JSON.parse(raw) as LogLine;
        setLines((prev) => [...prev, parsed]);
      } catch {
        setLines((prev) => [
          ...prev,
          { ts: new Date().toISOString(), stream: "build", message: raw },
        ]);
      }
    };

    es.onmessage = (e) => onLine(e.data);
    es.addEventListener("log", (e) => onLine((e as MessageEvent).data));
    es.addEventListener("end", () => es.close());

    es.onerror = () => {
      setConnected(false);
      setStreamError("Stream disconnected. Retrying…");
    };

    return () => es.close();
  }, [deployment?.id]);

  useLayoutEffect(() => {
    if (!autoScroll) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(nearBottom);
  }

  if (!deployment) {
    return (
      <div className="h-full rounded-xl border border-neutral-800 bg-neutral-950 flex items-center justify-center">
        <p className="text-sm text-neutral-500">No deployment selected.</p>
      </div>
    );
  }

  return (
    <div className="h-full rounded-xl border border-neutral-800 bg-neutral-950 flex flex-col overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto font-mono text-[12px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="p-5 text-neutral-600">
            {connected ? "Waiting for output…" : "Connecting to log stream…"}
          </div>
        ) : (
          <ul className="px-5 py-3 space-y-0.5">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-neutral-600 shrink-0 w-20">
                  {formatTime(l.ts)}
                </span>
                <span className={`shrink-0 w-16 ${streamColor(l.stream)}`}>
                  {l.stream}
                </span>
                <span className="text-neutral-200 whitespace-pre-wrap break-words">
                  {l.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="px-5 py-2 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500 bg-neutral-900/60">
        <span>
          {connected ? (
            <span className="text-emerald-400">● live</span>
          ) : streamError ? (
            <span className="text-amber-400">● {streamError}</span>
          ) : (
            <span>● idle</span>
          )}
          {"  "}· {lines.length} line{lines.length === 1 ? "" : "s"}
        </span>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-emerald-500"
          />
          auto-scroll
        </label>
      </footer>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(11, 19);
}

function streamColor(stream: LogLine["stream"]): string {
  switch (stream) {
    case "build":
      return "text-amber-400";
    case "deploy":
      return "text-blue-400";
    case "runtime":
      return "text-emerald-400";
  }
}
