import type { Deployment } from "../lib/types";
import { StatusBadge } from "./StatusBadge";
import { relativeTime, shortTag } from "../lib/format";

interface Props {
  deployments: Deployment[];
  onSelect: (id: string) => void;
  isLoading: boolean;
  error: unknown;
}

export function DeploymentList({
  deployments,
  onSelect,
  isLoading,
  error,
}: Props) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      {isLoading && <Empty>Loading…</Empty>}

      {error instanceof Error && (
        <Empty tone="error">Failed to load deployments: {error.message}</Empty>
      )}

      {!isLoading && !error && deployments.length === 0 && (
        <Empty>
          No deployments yet. Click “New deployment” to get started.
        </Empty>
      )}

      {deployments.length > 0 && (
        <ul className="divide-y divide-neutral-800/80">
          {deployments.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                className="w-full text-left px-5 py-4 hover:bg-neutral-800/40 transition grid grid-cols-12 gap-4 items-center"
              >
                <div className="col-span-12 sm:col-span-4 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {d.name}
                    </span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-1 truncate">
                    {d.source.type === "git"
                      ? d.source.repo
                      : `upload: ${d.source.filename}`}
                  </div>
                </div>

                <div className="col-span-6 sm:col-span-3 min-w-0 font-mono text-[11px] text-neutral-400 truncate">
                  {shortTag(d.imageTag)}
                </div>

                <div className="col-span-6 sm:col-span-4 min-w-0 text-[11px] truncate">
                  {d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      {d.url} ↗
                    </a>
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </div>

                <div className="col-span-12 sm:col-span-1 text-[11px] text-neutral-500 sm:text-right">
                  {relativeTime(d.updatedAt)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <div
      className={`p-5 text-xs ${
        tone === "error" ? "text-red-400" : "text-neutral-500"
      }`}
    >
      {children}
    </div>
  );
}
