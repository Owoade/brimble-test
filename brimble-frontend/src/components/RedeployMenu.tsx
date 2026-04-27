import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deploymentKeys, useDeploymentImages } from "../lib/queries";
import {
  clearPendingDeployment,
  startPendingRollback,
  usePendingDeployment,
} from "../lib/pendingDeployments";
import { relativeTime, shortTag } from "../lib/format";
import type { Deployment, DeploymentImage } from "../lib/types";

type View = "root" | "previous";

interface Props {
  deployment: Deployment;
}

export function RedeployMenu({ deployment }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("root");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();
  const pending = usePendingDeployment(deployment.id);
  const rolling = Boolean(pending && !pending.done);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setView("root");
      setErrorMsg(null);
    }
  }, [open]);

  const imagesQuery = useDeploymentImages(open ? deployment.slug : undefined);
  const images = imagesQuery.data ?? [];
  const currentTag = deployment.imageTag;
  const previous = images.filter((b) => b.imageTag !== currentTag);

  function trigger(image: DeploymentImage) {
    const imageId = Number(image.id);
    if (!Number.isFinite(imageId)) {
      setErrorMsg(`Invalid image id: ${image.id}`);
      return;
    }
    const started = startPendingRollback(deployment, imageId, {
      onDone: () => {
        qc.invalidateQueries({ queryKey: deploymentKeys.list() });
        qc.invalidateQueries({ queryKey: deploymentKeys.detail(deployment.id) });
        if (deployment.slug) {
          qc.invalidateQueries({
            queryKey: deploymentKeys.status(deployment.slug),
          });
          qc.invalidateQueries({
            queryKey: deploymentKeys.buildLogs(deployment.slug),
          });
          qc.invalidateQueries({
            queryKey: deploymentKeys.runtimeLogs(deployment.slug),
          });
          qc.invalidateQueries({
            queryKey: deploymentKeys.images(deployment.slug),
          });
        }
        setTimeout(() => clearPendingDeployment(deployment.id), 1500);
      },
    });
    if (!started) {
      setErrorMsg("Cannot roll back: deployment slug is missing.");
      return;
    }
    setErrorMsg(null);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={rolling}
        className="text-xs rounded-md border border-neutral-700 hover:border-neutral-500 px-2.5 py-1 text-neutral-300 disabled:opacity-50 inline-flex items-center gap-1.5"
      >
        {rolling ? "Rolling back…" : "Redeploy"}
        <span className="text-neutral-500 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-72 rounded-md border border-neutral-700 bg-neutral-900 shadow-lg z-10 text-xs overflow-hidden">
          {view === "root" ? (
            <ul className="py-1">
              <li>
                <button
                  type="button"
                  onClick={() => setView("previous")}
                  disabled={imagesQuery.isLoading || previous.length === 0}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-800 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-between"
                >
                  <span className="text-neutral-200">Previous builds</span>
                  <span className="text-neutral-500">
                    {imagesQuery.isLoading ? "…" : previous.length}
                    <span className="ml-1">›</span>
                  </span>
                </button>
              </li>
              {currentTag && (
                <li className="border-t border-neutral-800 px-3 py-2 flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                    Current build
                  </span>
                  <span className="font-mono text-[10px] text-neutral-400 truncate">
                    {shortTag(currentTag)}
                  </span>
                </li>
              )}
              {imagesQuery.error instanceof Error && (
                <li className="px-3 py-2 text-[10px] text-red-400 border-t border-neutral-800 break-words">
                  {imagesQuery.error.message}
                </li>
              )}
            </ul>
          ) : (
            <PreviousList
              builds={previous}
              onPick={trigger}
              onBack={() => setView("root")}
            />
          )}

          {errorMsg && (
            <p className="px-3 py-2 text-[10px] text-red-400 border-t border-neutral-800 break-words">
              {errorMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PreviousList({
  builds,
  onPick,
  onBack,
}: {
  builds: DeploymentImage[];
  onPick: (b: DeploymentImage) => void;
  onBack: () => void;
}) {
  return (
    <div className="max-h-72 overflow-y-auto">
      <button
        type="button"
        onClick={onBack}
        className="w-full text-left px-3 py-2 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 border-b border-neutral-800"
      >
        ‹ Back
      </button>
      <ul>
        {builds.map((b) => (
          <li key={b.id} className="border-b border-neutral-800 last:border-b-0">
            <button
              type="button"
              onClick={() => onPick(b)}
              className="w-full text-left px-3 py-2 hover:bg-neutral-800 flex flex-col gap-0.5"
            >
              <span className="font-mono text-[11px] text-neutral-200 truncate">
                {shortTag(b.imageTag)}
              </span>
              <span className="text-[10px] text-neutral-500">
                built {relativeTime(b.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
