import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { LogViewer } from "./LogViewer";
import { StatusBadge } from "./StatusBadge";
import { RedeployMenu } from "./RedeployMenu";
import { useUpdateEnv } from "../lib/queries";
import { relativeTime, shortTag } from "../lib/format";
import { envToText, parseEnvText } from "../lib/env";
import type { Deployment } from "../lib/types";

interface Props {
  deployment: Deployment | null;
  open: boolean;
  onClose: () => void;
}

export function DeploymentDetailModal({ deployment, open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} size="xl">
      {deployment && (
        <div className="flex flex-col h-[80vh] min-h-0">
          <header className="px-5 py-4 border-b border-neutral-800 flex items-start justify-between gap-4 shrink-0">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold truncate">
                  {deployment.name}
                </h2>
                <StatusBadge status={deployment.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500">
                <span className="font-mono">
                  {shortTag(deployment.imageTag)}
                </span>
                <span>updated {relativeTime(deployment.updatedAt)}</span>
                <SourceLabel deployment={deployment} />
                {deployment.url && (
                  <a
                    href={deployment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 truncate"
                  >
                    {deployment.url} ↗
                  </a>
                )}
              </div>
              {deployment.errorMessage && (
                <p className="text-xs text-red-400 break-words">
                  {deployment.errorMessage}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RedeployMenu deployment={deployment} />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="text-neutral-400 hover:text-neutral-200 text-xl leading-none px-1"
              >
                ×
              </button>
            </div>
          </header>

          <EnvSection deployment={deployment} />

          <div className="flex-1 min-h-0 p-4 pt-2">
            <LogViewer deployment={deployment} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function SourceLabel({ deployment }: { deployment: Deployment }) {
  if (deployment.source.type === "git") {
    return (
      <span className="truncate">
        git: {deployment.source.repo}
        {deployment.source.branch ? `#${deployment.source.branch}` : ""}
      </span>
    );
  }
  return <span className="truncate">upload: {deployment.source.filename}</span>;
}

function EnvSection({ deployment }: { deployment: Deployment }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => envToText(deployment.env));
  const update = useUpdateEnv();

  useEffect(() => {
    if (!editing) setText(envToText(deployment.env));
  }, [deployment.env, editing]);

  const entries = Object.entries(deployment.env);
  const errorMsg = update.error instanceof Error ? update.error.message : null;

  function startEdit() {
    setOpen(true);
    setText(envToText(deployment.env));
    setEditing(true);
    update.reset();
  }

  function cancelEdit() {
    setEditing(false);
    setText(envToText(deployment.env));
    update.reset();
  }

  async function save() {
    const env = parseEnvText(text);
    try {
      await update.mutateAsync({ id: deployment.id, env });
      setEditing(false);
    } catch {
      /* shown below */
    }
  }

  return (
    <section className="border-b border-neutral-800 shrink-0">
      <header className="px-5 py-2.5 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-neutral-400 hover:text-neutral-200 inline-flex items-center gap-2 select-none"
        >
          <span
            className={`text-neutral-600 transition-transform ${
              open ? "rotate-90" : ""
            }`}
          >
            ▸
          </span>
          <span>Environment ({entries.length})</span>
        </button>
        {open && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-[11px] rounded-md border border-neutral-700 hover:border-neutral-500 px-2 py-0.5 text-neutral-300"
          >
            Edit
          </button>
        )}
      </header>

      {open && !editing && (
        <div className="px-5 pb-3">
          {entries.length === 0 ? (
            <p className="text-[11px] text-neutral-500">
              No environment variables set.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
              {entries.map(([k, v]) => (
                <li key={k} className="flex gap-2 min-w-0">
                  <span className="text-neutral-500 shrink-0">{k}</span>
                  <span className="text-neutral-300 truncate" title={v}>
                    {v}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {open && editing && (
        <div className="px-5 pb-4 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(10, Math.max(4, text.split("\n").length))}
            spellCheck={false}
            placeholder={"NODE_ENV=production\nPORT=3000"}
            className="w-full rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 font-mono text-[11px] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
          />
          <p className="text-[11px] text-neutral-500">
            One per line, KEY=value. Lines starting with # are ignored.
            Redeploy to apply changes to the running container.
          </p>
          {errorMsg && (
            <p className="text-[11px] text-red-400 break-words">{errorMsg}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={update.isPending}
              className="text-xs rounded-md border border-neutral-700 hover:border-neutral-500 px-2.5 py-1 text-neutral-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className="text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-2.5 py-1 font-medium disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
