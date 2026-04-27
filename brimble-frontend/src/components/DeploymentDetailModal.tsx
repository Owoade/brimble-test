import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "./Modal";
import { LogViewer } from "./LogViewer";
import { StatusBadge } from "./StatusBadge";
import { RedeployMenu } from "./RedeployMenu";
import { api } from "../lib/api";
import { deploymentKeys, useDeploymentStatus } from "../lib/queries";
import {
  clearPendingDeployment,
  startPendingEnvUpdate,
  startPendingSourceUpdate,
  usePendingDeployment,
} from "../lib/pendingDeployments";
import { relativeTime, shortTag } from "../lib/format";
import { envToText } from "../lib/env";
import type {
  BackendContainerStatus,
  Deployment,
  UpdateSourceInput,
} from "../lib/types";

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
              <ContainerStatusLine deployment={deployment} />
              <p className="text-[11px] text-neutral-500">
                App must listen on{" "}
                <span className="font-mono text-neutral-300">port 3000</span>.
              </p>
              {deployment.errorMessage && (
                <p className="text-xs text-red-400 break-words">
                  {deployment.errorMessage}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RedeployMenu deployment={deployment} />
              <DeleteDeploymentButton
                deployment={deployment}
                onDeleted={onClose}
              />
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

          <SourceSection deployment={deployment} />
          <EnvSection deployment={deployment} />

          <div className="flex-1 min-h-0 p-4 pt-2">
            <LogViewer deployment={deployment} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function ContainerStatusLine({ deployment }: { deployment: Deployment }) {
  const slug = deployment.status === "running" ? deployment.slug : undefined;
  const { data, error } = useDeploymentStatus(slug);
  if (!slug) return null;
  if (error) return null;
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 font-mono">
      <span>
        container:{" "}
        <span
          className={
            data.Running ? "text-emerald-400" : "text-neutral-300"
          }
        >
          {statusLabel(data)}
        </span>
      </span>
      {data.Pid > 0 && <span>pid {data.Pid}</span>}
    </div>
  );
}

function statusLabel(s: BackendContainerStatus): string {
  if (s.Running) return s.Status || "running";
  return s.Status || "stopped";
}

function SourceLabel({ deployment }: { deployment: Deployment }) {
  if (!deployment.source) {
    return deployment.slug ? (
      <span className="truncate">slug: {deployment.slug}</span>
    ) : null;
  }
  if (deployment.source.type === "github") {
    return (
      <span className="truncate">github: {deployment.source.githubLink}</span>
    );
  }
  return <span className="truncate">upload: {deployment.source.filename}</span>;
}

function EnvSection({ deployment }: { deployment: Deployment }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => envToText(deployment.env));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const qc = useQueryClient();
  const pending = usePendingDeployment(deployment.id);
  const updating = Boolean(pending && !pending.done);

  useEffect(() => {
    if (!editing) setText(envToText(deployment.env));
  }, [deployment.env, editing]);

  const entries = Object.entries(deployment.env);

  function startEdit() {
    setOpen(true);
    setText(envToText(deployment.env));
    setEditing(true);
    setErrorMsg(null);
  }

  function cancelEdit() {
    setEditing(false);
    setText(envToText(deployment.env));
    setErrorMsg(null);
  }

  function save() {
    const nextText = text;
    const currentText = envToText(deployment.env);
    if (nextText.trim() === currentText.trim()) {
      setEditing(false);
      return;
    }
    if (!deployment.slug) {
      setErrorMsg("Cannot update env: deployment slug is missing.");
      return;
    }
    setErrorMsg(null);
    const started = startPendingEnvUpdate(deployment, nextText, {
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
      setErrorMsg("Cannot update env: deployment slug is missing.");
      return;
    }
    setEditing(false);
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
            disabled={updating}
            className="text-[11px] rounded-md border border-neutral-700 hover:border-neutral-500 px-2 py-0.5 text-neutral-300 disabled:opacity-50"
          >
            {updating ? "Updating…" : "Edit"}
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
            One per line, KEY=value. Lines starting with # are ignored. Saving
            triggers a rebuild and streams logs below.
          </p>
          {errorMsg && (
            <p className="text-[11px] text-red-400 break-words">{errorMsg}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs rounded-md border border-neutral-700 hover:border-neutral-500 px-2.5 py-1 text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-2.5 py-1 font-medium"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SourceSection({ deployment }: { deployment: Deployment }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<UpdateSourceInput["type"]>(
    deployment.source?.type === "zip-upload" ? "zip-upload" : "github",
  );
  const [githubLink, setGithubLink] = useState(
    deployment.source?.type === "github" ? deployment.source.githubLink : "",
  );
  const [file, setFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const qc = useQueryClient();
  const pending = usePendingDeployment(deployment.id);
  const updating = Boolean(pending && !pending.done);

  function startEdit() {
    setOpen(true);
    setEditing(true);
    setErrorMsg(null);
  }

  function cancelEdit() {
    setEditing(false);
    setFile(null);
    setErrorMsg(null);
  }

  function save() {
    if (!deployment.slug) {
      setErrorMsg("Cannot update source: deployment slug is missing.");
      return;
    }
    if (type === "github" && !githubLink.trim()) {
      setErrorMsg("GitHub link is required.");
      return;
    }
    if (type === "zip-upload" && !file) {
      setErrorMsg("Please choose a .zip archive.");
      return;
    }
    setErrorMsg(null);
    const input: UpdateSourceInput = {
      type,
      githubLink: type === "github" ? githubLink.trim() : undefined,
      file: type === "zip-upload" ? file : null,
    };
    const started = startPendingSourceUpdate(deployment, input, {
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
      setErrorMsg("Cannot update source: deployment slug is missing.");
      return;
    }
    setEditing(false);
    setFile(null);
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
          <span>Source</span>
        </button>
        {open && !editing && (
          <button
            type="button"
            onClick={startEdit}
            disabled={updating}
            className="text-[11px] rounded-md border border-neutral-700 hover:border-neutral-500 px-2 py-0.5 text-neutral-300 disabled:opacity-50"
          >
            {updating ? "Updating…" : "Update source"}
          </button>
        )}
      </header>

      {open && !editing && (
        <div className="px-5 pb-3 text-[11px] text-neutral-400 font-mono break-all">
          {deployment.source ? (
            deployment.source.type === "github" ? (
              <span>github: {deployment.source.githubLink}</span>
            ) : (
              <span>upload: {deployment.source.filename}</span>
            )
          ) : (
            <span className="text-neutral-500">
              Source is not tracked for this deployment.
            </span>
          )}
        </div>
      )}

      {open && editing && (
        <div className="px-5 pb-4 space-y-3">
          <div className="inline-flex rounded-lg bg-neutral-800/60 p-0.5 text-xs">
            {(["github", "zip-upload"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setType(m)}
                className={`px-3 py-1 rounded-md transition ${
                  type === m
                    ? "bg-neutral-950 text-neutral-100 shadow"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {m === "github" ? "GitHub" : "Zip upload"}
              </button>
            ))}
          </div>

          {type === "github" ? (
            <input
              value={githubLink}
              onChange={(e) => setGithubLink(e.target.value)}
              placeholder="https://github.com/user/repo"
              className="w-full rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 text-xs placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
            />
          ) : (
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-xs file:text-neutral-100 hover:file:bg-neutral-700"
            />
          )}

          <p className="text-[11px] text-neutral-500">
            Saving triggers a rebuild and streams logs below.
          </p>
          {errorMsg && (
            <p className="text-[11px] text-red-400 break-words">{errorMsg}</p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="text-xs rounded-md border border-neutral-700 hover:border-neutral-500 px-2.5 py-1 text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="text-xs rounded-md bg-emerald-500 hover:bg-emerald-400 text-neutral-950 px-2.5 py-1 font-medium"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function DeleteDeploymentButton({
  deployment,
  onDeleted,
}: {
  deployment: Deployment;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  function reset() {
    setConfirmText("");
    setErrorMsg(null);
    setSubmitting(false);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  async function confirm() {
    if (!deployment.slug) {
      setErrorMsg("Cannot delete: deployment slug is missing.");
      return;
    }
    if (confirmText !== deployment.name) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.deleteDeployment(deployment.slug);
      qc.invalidateQueries({ queryKey: deploymentKeys.list() });
      qc.invalidateQueries({ queryKey: deploymentKeys.detail(deployment.id) });
      setOpen(false);
      reset();
      onDeleted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const matches = confirmText === deployment.name;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs rounded-md border border-red-900/60 hover:border-red-700 hover:bg-red-950/40 px-2.5 py-1 text-red-300"
      >
        Delete
      </button>

      <Modal open={open} onClose={close} size="sm">
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-neutral-100">
              Delete deployment
            </h3>
            <p className="text-xs text-neutral-400">
              This permanently removes{" "}
              <span className="font-mono text-neutral-200">
                {deployment.name}
              </span>{" "}
              and its containers. This action cannot be undone.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] text-neutral-400">
              Type{" "}
              <span className="font-mono text-neutral-200">
                {deployment.name}
              </span>{" "}
              to confirm
            </label>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 text-xs font-mono placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/50 disabled:opacity-60"
              placeholder={deployment.name}
            />
          </div>

          {errorMsg && (
            <p className="text-[11px] text-red-400 break-words">{errorMsg}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="text-xs rounded-md border border-neutral-700 hover:border-neutral-500 px-2.5 py-1 text-neutral-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!matches || submitting}
              className="text-xs rounded-md bg-red-600 hover:bg-red-500 text-neutral-50 px-2.5 py-1 font-medium disabled:opacity-40 disabled:hover:bg-red-600"
            >
              {submitting ? "Deleting…" : "Delete deployment"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
