import { useState, type FormEvent } from "react";
import { useCreateDeployment } from "../lib/queries";
import { parseEnvText } from "../lib/env";
import type { Deployment } from "../lib/types";

type SourceMode = "git" | "upload";

interface Props {
  onCreated?: (d: Deployment) => void;
  embedded?: boolean;
}

export function DeploymentForm({ onCreated, embedded = false }: Props) {
  const [mode, setMode] = useState<SourceMode>("git");
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [envText, setEnvText] = useState("");

  const create = useCreateDeployment();

  function reset() {
    setName("");
    setGitUrl("");
    setBranch("");
    setFile(null);
    setEnvText("");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "git" && !gitUrl.trim()) return;
    if (mode === "upload" && !file) return;

    const env = parseEnvText(envText);

    try {
      const d = await create.mutateAsync({
        name: name.trim() || undefined,
        gitUrl: mode === "git" ? gitUrl.trim() : undefined,
        branch: mode === "git" && branch.trim() ? branch.trim() : undefined,
        file: mode === "upload" ? file : null,
        env,
      });
      onCreated?.(d);
      reset();
    } catch {
      /* error surfaced below */
    }
  }

  const submitting = create.isPending;
  const errorMsg = create.error instanceof Error ? create.error.message : null;

  const formCls = embedded
    ? "space-y-4"
    : "rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4";

  return (
    <form onSubmit={handleSubmit} className={formCls}>
      {!embedded && (
        <div>
          <h2 className="text-sm font-semibold">New deployment</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Point us at a repo or upload a tarball. Railpack does the rest.
          </p>
        </div>
      )}

      <div className="inline-flex rounded-lg bg-neutral-800/60 p-0.5 text-xs">
        {(["git", "upload"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-md transition ${
              mode === m
                ? "bg-neutral-950 text-neutral-100 shadow"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {m === "git" ? "Git URL" : "Upload"}
          </button>
        ))}
      </div>

      <Field label="Name" hint="Optional. Used in the URL slug.">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-app"
          className={inputCls}
        />
      </Field>

      {mode === "git" ? (
        <>
          <Field label="Git URL" required>
            <input
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              className={inputCls}
              required
            />
          </Field>
          <Field label="Branch" hint="Defaults to the repo's default branch.">
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className={inputCls}
            />
          </Field>
        </>
      ) : (
        <Field label="Project archive" required hint=".zip or .tar.gz">
          <input
            type="file"
            accept=".zip,.tar,.tgz,.tar.gz,application/zip,application/gzip,application/x-tar"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-xs file:text-neutral-100 hover:file:bg-neutral-700"
            required
          />
        </Field>
      )}

      <Field
        label="Environment variables"
        hint="One per line, KEY=value. Lines starting with # are ignored."
      >
        <textarea
          value={envText}
          onChange={(e) => setEnvText(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={"NODE_ENV=production\nPORT=3000\n# DATABASE_URL=..."}
          className={`${inputCls} font-mono text-xs leading-relaxed resize-y min-h-[7rem]`}
        />
      </Field>

      {errorMsg && (
        <p className="text-xs text-red-400 break-words">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-950 text-sm font-medium px-4 py-2 transition"
      >
        {submitting ? "Queuing…" : "Deploy"}
      </button>
    </form>
  );
}

const inputCls =
  "w-full rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 text-sm placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-neutral-300">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-500">{hint}</span>}
    </label>
  );
}
