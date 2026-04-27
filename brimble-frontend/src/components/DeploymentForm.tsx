import { useState, type FormEvent } from "react";
import { startPendingDeployment } from "../lib/pendingDeployments";

type SourceType = "github" | "zip-upload";

interface Props {
  onCreated?: (id: string) => void;
  embedded?: boolean;
}

export function DeploymentForm({ onCreated, embedded = false }: Props) {
  const [type, setType] = useState<SourceType>("github");
  const [name, setName] = useState("");
  const [githubLink, setGithubLink] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [envText, setEnvText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function reset() {
    setName("");
    setGithubLink("");
    setFile(null);
    setEnvText("");
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    if (type === "github" && !githubLink.trim()) return;
    if (type === "zip-upload" && !file) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const id = startPendingDeployment({
        name: name.trim(),
        type,
        githubLink: type === "github" ? githubLink.trim() : undefined,
        file: type === "zip-upload" ? file : null,
        envText: envText.trim() || undefined,
      });
      onCreated?.(id);
      reset();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

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

      <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-[11px] text-neutral-400">
        <span className="text-neutral-300">Heads up:</span> your app must
        listen on{" "}
        <span className="font-mono text-neutral-200">port 3000</span> to
        receive traffic.
      </div>

      <div className="inline-flex rounded-lg bg-neutral-800/60 p-0.5 text-xs">
        {(["github", "zip-upload"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setType(m)}
            className={`px-3 py-1.5 rounded-md transition ${
              type === m
                ? "bg-neutral-950 text-neutral-100 shadow"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {m === "github" ? "GitHub" : "Zip upload"}
          </button>
        ))}
      </div>

      <Field label="Name" required hint="Used in the URL slug.">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-app"
          className={inputCls}
          required
        />
      </Field>

      {type === "github" ? (
        <Field label="GitHub link" required>
          <input
            value={githubLink}
            onChange={(e) => setGithubLink(e.target.value)}
            placeholder="https://github.com/user/repo"
            className={inputCls}
            required
          />
        </Field>
      ) : (
        <Field label="Project archive" required hint=".zip">
          <input
            type="file"
            accept=".zip,application/zip"
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
