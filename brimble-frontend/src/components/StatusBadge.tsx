import type { DeploymentStatus } from "../lib/types";

const styles: Record<DeploymentStatus, string> = {
  pending: "bg-neutral-800 text-neutral-300 ring-neutral-700",
  building: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  deploying: "bg-blue-500/10 text-blue-300 ring-blue-500/30",
  running: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  failed: "bg-red-500/10 text-red-300 ring-red-500/30",
};

const isLive: Record<DeploymentStatus, boolean> = {
  pending: true,
  building: true,
  deploying: true,
  running: false,
  failed: false,
};

export function StatusBadge({ status }: { status: DeploymentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[status]}`}
    >
      {isLive[status] && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {status}
    </span>
  );
}
