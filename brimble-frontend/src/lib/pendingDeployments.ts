import { useSyncExternalStore } from "react";
import { parseEnvText } from "./env";
import {
  streamDeployment,
  streamEnvUpdate,
  streamRollback,
  streamSourceUpdate,
} from "./deploymentStream";
import type {
  CreateDeploymentInput,
  Deployment,
  DeploymentSource,
  DeploymentStatus,
  LogLine,
  UpdateSourceInput,
} from "./types";

export interface PendingDeployment {
  id: string;
  name: string;
  slug?: string;
  status: DeploymentStatus;
  source?: DeploymentSource;
  env: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  url: string | null;
  errorMessage: string | null;
  lines: LogLine[];
  done: boolean;
}

export function isInternalLogLine(line: LogLine): boolean {
  return line.level.toUpperCase().startsWith("INTERNAL");
}

function applyInternalLine(p: PendingDeployment, line: LogLine): boolean {
  if (!isInternalLogLine(line)) return false;
  const msg = line.message.trim();
  for (const part of msg.split(/[\s,]+/)) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    if (key === "slug") p.slug = value;
  }
  return true;
}

function applyLogLine(p: PendingDeployment, line: LogLine): void {
  if (applyInternalLine(p, line)) return;
  p.lines = [...p.lines, line];
  if (
    line.level.toUpperCase() === "SUCCESS" &&
    /^https?:\/\//i.test(line.message.trim())
  ) {
    p.url = line.message.trim();
  }
}

const store = new Map<string, PendingDeployment>();
const listeners = new Set<() => void>();
let snapshotVersion = 0;

function notify() {
  snapshotVersion++;
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return snapshotVersion;
}

function update(id: string, patch: (p: PendingDeployment) => void) {
  const cur = store.get(id);
  if (!cur) return;
  const next: PendingDeployment = { ...cur };
  patch(next);
  next.updatedAt = new Date().toISOString();
  store.set(id, next);
  notify();
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function startPendingDeployment(input: CreateDeploymentInput): string {
  const id = makeId();
  const nowIso = new Date().toISOString();
  const source: DeploymentSource =
    input.type === "github"
      ? { type: "github", githubLink: input.githubLink ?? "" }
      : { type: "zip-upload", filename: input.file?.name ?? "archive" };

  store.set(id, {
    id,
    name: input.name,
    status: "building",
    source,
    env: input.envText ? parseEnvText(input.envText) : {},
    createdAt: nowIso,
    updatedAt: nowIso,
    url: null,
    errorMessage: null,
    lines: [],
    done: false,
  });
  notify();

  const controller = new AbortController();

  void streamDeployment(
    input,
    {
      onLine: (line) => {
        let slugJustCaptured = false;
        update(id, (p) => {
          const hadSlug = Boolean(p.slug);
          applyLogLine(p, line);
          if (!hadSlug && p.slug) slugJustCaptured = true;
        });
        if (slugJustCaptured) {
          update(id, (p) => {
            if (p.done) return;
            p.done = true;
            p.status = "running";
          });
          controller.abort();
        }
      },
      onError: (err) => {
        update(id, (p) => {
          if (p.done) return;
          p.errorMessage = err.message;
        });
      },
      onDone: () => {
        update(id, (p) => {
          if (p.done) return;
          p.done = true;
          if (p.errorMessage) p.status = "failed";
          else if (p.url) p.status = "running";
          else p.status = "failed";
        });
      },
    },
    controller.signal,
  );

  return id;
}

export interface EnvUpdateOptions {
  onDone?: (entry: PendingDeployment) => void;
}

export function startPendingEnvUpdate(
  deployment: Deployment,
  envText: string,
  opts: EnvUpdateOptions = {},
): string | null {
  if (!deployment.slug) return null;
  const key = deployment.id;
  const existing = store.get(key);
  if (existing && !existing.done) return key;

  const nowIso = new Date().toISOString();
  store.set(key, {
    id: key,
    name: deployment.name,
    status: "building",
    source: deployment.source,
    env: envText ? parseEnvText(envText) : {},
    createdAt: nowIso,
    updatedAt: nowIso,
    url: deployment.url,
    errorMessage: null,
    lines: [],
    done: false,
  });
  notify();

  void streamEnvUpdate(deployment.slug, envText, {
    onLine: (line) => {
      update(key, (p) => applyLogLine(p, line));
    },
    onError: (err) => {
      update(key, (p) => {
        p.errorMessage = err.message;
      });
    },
    onDone: () => {
      update(key, (p) => {
        p.done = true;
        if (p.errorMessage) p.status = "failed";
        else p.status = "running";
      });
      const finalEntry = store.get(key);
      if (finalEntry) opts.onDone?.(finalEntry);
    },
  });

  return key;
}

export function startPendingSourceUpdate(
  deployment: Deployment,
  input: UpdateSourceInput,
  opts: EnvUpdateOptions = {},
): string | null {
  if (!deployment.slug) return null;
  const key = deployment.id;
  const existing = store.get(key);
  if (existing && !existing.done) return key;

  const nowIso = new Date().toISOString();
  const source: DeploymentSource =
    input.type === "github"
      ? { type: "github", githubLink: input.githubLink ?? "" }
      : { type: "zip-upload", filename: input.file?.name ?? "archive" };

  store.set(key, {
    id: key,
    name: deployment.name,
    status: "building",
    source,
    env: deployment.env,
    createdAt: nowIso,
    updatedAt: nowIso,
    url: deployment.url,
    errorMessage: null,
    lines: [],
    done: false,
  });
  notify();

  void streamSourceUpdate(deployment.slug, input, {
    onLine: (line) => {
      update(key, (p) => applyLogLine(p, line));
    },
    onError: (err) => {
      update(key, (p) => {
        p.errorMessage = err.message;
      });
    },
    onDone: () => {
      update(key, (p) => {
        p.done = true;
        if (p.errorMessage) p.status = "failed";
        else p.status = "running";
      });
      const finalEntry = store.get(key);
      if (finalEntry) opts.onDone?.(finalEntry);
    },
  });

  return key;
}

export function startPendingRollback(
  deployment: Deployment,
  imageId: number,
  opts: EnvUpdateOptions = {},
): string | null {
  if (!deployment.slug) return null;
  const key = deployment.id;
  const existing = store.get(key);
  if (existing && !existing.done) return key;

  const nowIso = new Date().toISOString();
  store.set(key, {
    id: key,
    name: deployment.name,
    status: "building",
    source: deployment.source,
    env: deployment.env,
    createdAt: nowIso,
    updatedAt: nowIso,
    url: deployment.url,
    errorMessage: null,
    lines: [],
    done: false,
  });
  notify();

  void streamRollback(deployment.slug, imageId, {
    onLine: (line) => {
      update(key, (p) => applyLogLine(p, line));
    },
    onError: (err) => {
      update(key, (p) => {
        p.errorMessage = err.message;
      });
    },
    onDone: () => {
      update(key, (p) => {
        p.done = true;
        if (p.errorMessage) p.status = "failed";
        else p.status = "running";
      });
      const finalEntry = store.get(key);
      if (finalEntry) opts.onDone?.(finalEntry);
    },
  });

  return key;
}

export function clearPendingDeployment(id: string): void {
  if (store.delete(id)) notify();
}

export function usePendingDeployment(
  id: string | null | undefined,
): PendingDeployment | null {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (!id) return null;
  return store.get(id) ?? null;
}

export function pendingAsDeployment(p: PendingDeployment): Deployment {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    source: p.source,
    imageTag: null,
    url: p.url,
    env: p.env,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    errorMessage: p.errorMessage,
    builds: [],
  };
}
