import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Deployment, LogLine } from "../lib/types";
import {
  isInternalLogLine,
  usePendingDeployment,
} from "../lib/pendingDeployments";
import { useDeploymentLogs, type DeploymentLogSource } from "../lib/queries";
import { parseLogLine } from "../lib/deploymentStream";

interface Props {
  deployment: Deployment | null;
}

type Tab = "runtime" | "build";

export function LogViewer({ deployment }: Props) {
  const pending = usePendingDeployment(deployment?.id);
  const showTabs = !pending && deployment?.status === "running";
  const [tab, setTab] = useState<Tab>("runtime");

  useEffect(() => {
    setTab("runtime");
  }, [deployment?.slug]);

  const override: DeploymentLogSource | undefined = showTabs ? tab : undefined;
  const fetched = useDeploymentLogs(
    pending ? undefined : deployment?.slug,
    pending ? undefined : deployment?.status,
    override,
  );

  const fetchedLines = useMemo<LogLine[]>(() => {
    if (pending || !fetched.data) return [];
    if (fetched.source === "runtime") {
      return fetched.data
        .filter((s) => s.length > 0)
        .map((message) => ({ ts: 0, level: "", message }));
    }
    return fetched.data
      .map((raw) => parseLogLine(raw))
      .filter((l): l is LogLine => l !== null && !isInternalLogLine(l));
  }, [pending, fetched.data, fetched.source]);

  const lines: LogLine[] = pending ? pending.lines : fetchedLines;
  const live = pending
    ? !pending.done
    : deployment?.status === "building" || deployment?.status === "deploying";
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

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
      {showTabs && (
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-neutral-800 bg-neutral-900/40">
          {(["runtime", "build"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`text-[11px] px-2.5 py-1 rounded-t-md border-b-2 -mb-px transition ${
                tab === t
                  ? "border-emerald-500 text-neutral-100"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t === "runtime" ? "Runtime logs" : "Build logs"}
            </button>
          ))}
        </div>
      )}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto font-mono text-[12px] leading-relaxed"
      >
        {fetched.error instanceof Error && !pending ? (
          <div className="p-5 text-red-400">
            Failed to load logs: {fetched.error.message}
          </div>
        ) : lines.length === 0 ? (
          <div className="p-5 text-neutral-600">
            {pending
              ? live
                ? "Waiting for output…"
                : "No log output."
              : fetched.isLoading
                ? "Loading logs…"
                : fetched.source === null
                  ? "No logs available for this deployment."
                  : "No log output."}
          </div>
        ) : (
          <ul className="px-5 py-3 space-y-0.5">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-3">
                {l.ts > 0 && (
                  <span className="text-neutral-600 shrink-0 w-44">
                    {formatTime(l.ts)}
                  </span>
                )}
                {l.level && (
                  <span className={`shrink-0 w-20 ${levelColor(l.level)}`}>
                    {l.level}
                  </span>
                )}
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
          {live ? (
            <span className="text-emerald-400">● live</span>
          ) : pending?.errorMessage ? (
            <span className="text-red-400">● {pending.errorMessage}</span>
          ) : (
            <span>● idle</span>
          )}
          {!pending && fetched.source && (
            <span className="ml-2 text-neutral-500">
              ({fetched.source === "runtime" ? "runtime logs" : "build logs"})
            </span>
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

function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelColor(level: string): string {
  switch (level.toUpperCase()) {
    case "SUCCESS":
      return "text-emerald-400";
    case "ERROR":
    case "FATAL":
      return "text-red-400";
    case "WARN":
    case "WARNING":
      return "text-amber-400";
    case "DEBUG":
      return "text-neutral-500";
    default:
      return "text-blue-300";
  }
}
