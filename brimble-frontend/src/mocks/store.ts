import type {
  Build,
  CreateDeploymentInput,
  Deployment,
  DeploymentStatus,
  LogLine,
} from "../lib/types";
import {
  buildScript,
  deployScript,
  failingBuildScript,
  runtimeStartScript,
  type ScriptStep,
} from "./log-scripts";

type Subscriber = (line: LogLine) => void;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

function seedBuilds(
  prefix: string,
  name: string,
  currentTag: string,
  ages: number[],
): Build[] {
  return ages.map((ageMs, i) => ({
    id: `bld_${prefix}_${i}`,
    imageTag: i === 0 ? currentTag : `${name}:${randomSha()}`,
    status: "succeeded",
    createdAt: ago(ageMs),
  }));
}

function randomSha(): string {
  return Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

const seedDeployments: Deployment[] = [
  {
    id: "dpl_marketing01",
    name: "marketing-site",
    status: "running",
    source: { type: "git", repo: "https://github.com/brimble/marketing", branch: "main" },
    imageTag: "marketing-site:c0ffee1234abcd",
    url: "https://marketing-site.dpl.local.test",
    env: { NODE_ENV: "production", PORT: "3000", ANALYTICS_ID: "G-DEMO123" },
    createdAt: ago(1000 * 60 * 60 * 4),
    updatedAt: ago(1000 * 60 * 60 * 3),
    builds: seedBuilds("marketing", "marketing-site", "marketing-site:c0ffee1234abcd", [
      1000 * 60 * 60 * 3,
      1000 * 60 * 60 * 14,
      1000 * 60 * 60 * 28,
    ]),
  },
  {
    id: "dpl_apigw0002",
    name: "api-gateway",
    status: "running",
    source: { type: "git", repo: "https://github.com/brimble/api-gateway", branch: "main" },
    imageTag: "api-gateway:deadbeef99887",
    url: "https://api-gateway.dpl.local.test",
    env: {
      NODE_ENV: "production",
      PORT: "8080",
      DATABASE_URL: "postgres://app:****@db:5432/app",
      LOG_LEVEL: "info",
    },
    createdAt: ago(1000 * 60 * 60 * 26),
    updatedAt: ago(1000 * 60 * 60 * 25),
    builds: seedBuilds("apigw", "api-gateway", "api-gateway:deadbeef99887", [
      1000 * 60 * 60 * 25,
      1000 * 60 * 60 * 48,
      1000 * 60 * 60 * 72,
      1000 * 60 * 60 * 120,
    ]),
  },
  {
    id: "dpl_worker0003",
    name: "worker-broken",
    status: "failed",
    source: { type: "upload", filename: "worker.tar.gz" },
    imageTag: null,
    url: null,
    env: { NODE_ENV: "production", REDIS_URL: "redis://redis:6379" },
    errorMessage: "build failed: railpack could not detect a supported runtime",
    createdAt: ago(1000 * 60 * 60 * 8),
    updatedAt: ago(1000 * 60 * 60 * 8 - 1000 * 60 * 2),
    builds: [
      {
        id: "bld_worker_0",
        imageTag: "worker-broken:none",
        status: "failed",
        createdAt: ago(1000 * 60 * 60 * 8 - 1000 * 60 * 2),
      },
    ],
  },
];

function flatten(scripts: ScriptStep[][], baseIso: string): LogLine[] {
  const lines: LogLine[] = [];
  let t = new Date(baseIso).getTime();
  for (const script of scripts) {
    for (const s of script) {
      t += s.delayMs;
      lines.push({ ts: new Date(t).toISOString(), stream: s.stream, message: s.message });
    }
  }
  return lines;
}

function seedLogsFor(d: Deployment): LogLine[] {
  if (d.status === "running") {
    const tagLine: LogLine = {
      ts: d.updatedAt,
      stream: "build",
      message: `image tag: ${d.imageTag}`,
    };
    const lines = flatten([buildScript], d.createdAt);
    lines.push(tagLine);
    lines.push(...flatten([deployScript, runtimeStartScript], d.updatedAt));
    return lines;
  }
  if (d.status === "failed") {
    return flatten([failingBuildScript], d.createdAt);
  }
  return [];
}

class MockStore {
  private deployments = new Map<string, Deployment>();
  private logs = new Map<string, LogLine[]>();
  private subs = new Map<string, Set<Subscriber>>();
  private idCounter = 0;

  constructor() {
    for (const d of seedDeployments) {
      this.deployments.set(d.id, { ...d });
      this.logs.set(d.id, seedLogsFor(d));
    }
  }

  list(): Deployment[] {
    return Array.from(this.deployments.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  get(id: string): Deployment | undefined {
    const d = this.deployments.get(id);
    return d ? { ...d } : undefined;
  }

  getLogs(id: string): LogLine[] {
    return [...(this.logs.get(id) ?? [])];
  }

  subscribeLogs(id: string, cb: Subscriber): () => void {
    if (!this.subs.has(id)) this.subs.set(id, new Set());
    this.subs.get(id)!.add(cb);
    return () => {
      this.subs.get(id)?.delete(cb);
    };
  }

  create(input: CreateDeploymentInput): Deployment {
    this.idCounter += 1;
    const id = `dpl_${this.idCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const name = input.name?.trim() || this.deriveName(input) || `app-${this.idCounter}`;
    const source: Deployment["source"] = input.gitUrl
      ? { type: "git", repo: input.gitUrl, branch: input.branch }
      : { type: "upload", filename: input.file?.name ?? "upload.tar.gz" };
    const dep: Deployment = {
      id,
      name,
      status: "pending",
      source,
      imageTag: null,
      url: null,
      env: { ...input.env },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorMessage: null,
      builds: [],
    };
    this.deployments.set(id, dep);
    this.logs.set(id, []);
    const fail = /fail|broken|crash/i.test(name);
    void this.runPipeline(id, { kind: fail ? "fail" : "success" });
    return { ...dep };
  }

  updateEnv(id: string, env: Record<string, string>): Deployment {
    const cur = this.deployments.get(id);
    if (!cur) throw new Error("deployment not found");
    this.patch(id, { env: { ...env } });
    return { ...this.deployments.get(id)! };
  }

  redeploy(id: string, buildId?: string): Deployment {
    const cur = this.deployments.get(id);
    if (!cur) throw new Error("deployment not found");

    let reuseTag: string | undefined;
    if (buildId) {
      const build = cur.builds.find((b) => b.id === buildId);
      if (!build) throw new Error("build not found");
      if (build.status !== "succeeded") {
        throw new Error("cannot redeploy a failed build");
      }
      reuseTag = build.imageTag;
    }

    const next: Deployment = {
      ...cur,
      status: "pending",
      imageTag: reuseTag ?? null,
      url: null,
      errorMessage: null,
      updatedAt: new Date().toISOString(),
    };
    this.deployments.set(id, next);
    this.logs.set(id, []);
    void this.runPipeline(id, { kind: "success", reuseTag });
    return { ...next };
  }

  private async runPipeline(
    id: string,
    opts: { kind: "success" | "fail"; reuseTag?: string },
  ) {
    await sleep(400);
    if (opts.kind === "fail") {
      this.setStatus(id, "building");
      await this.playScript(id, failingBuildScript);
      this.recordBuild(id, "failed", this.makeTag(id));
      this.setStatus(id, "failed", "build failed: see logs");
      return;
    }

    let tag = opts.reuseTag;
    if (!tag) {
      this.setStatus(id, "building");
      await this.playScript(id, buildScript);
      tag = this.makeTag(id);
      this.patch(id, { imageTag: tag });
      this.recordBuild(id, "succeeded", tag);
      this.append(id, {
        ts: new Date().toISOString(),
        stream: "build",
        message: `image tag: ${tag}`,
      });
    } else {
      this.patch(id, { imageTag: tag });
      this.append(id, {
        ts: new Date().toISOString(),
        stream: "deploy",
        message: `reusing existing image: ${tag}`,
      });
    }

    this.setStatus(id, "deploying");
    await this.playScript(id, deployScript);
    this.patch(id, { url: this.makeUrl(id) });
    this.setStatus(id, "running");
    await this.playScript(id, runtimeStartScript);
  }

  private recordBuild(
    id: string,
    status: Build["status"],
    imageTag: string,
  ) {
    const cur = this.deployments.get(id);
    if (!cur) return;
    const build: Build = {
      id: `bld_${id.slice(4, 10)}_${cur.builds.length}_${Date.now().toString(36)}`,
      imageTag,
      status,
      createdAt: new Date().toISOString(),
    };
    this.patch(id, { builds: [build, ...cur.builds] });
  }

  private async playScript(id: string, script: ScriptStep[]) {
    for (const s of script) {
      await sleep(s.delayMs);
      this.append(id, {
        ts: new Date().toISOString(),
        stream: s.stream,
        message: s.message,
      });
    }
  }

  private append(id: string, line: LogLine) {
    const buf = this.logs.get(id) ?? [];
    buf.push(line);
    this.logs.set(id, buf);
    this.subs.get(id)?.forEach((cb) => cb(line));
  }

  private setStatus(id: string, status: DeploymentStatus, errorMessage: string | null = null) {
    this.patch(id, { status, errorMessage });
  }

  private patch(id: string, partial: Partial<Deployment>) {
    const cur = this.deployments.get(id);
    if (!cur) return;
    this.deployments.set(id, {
      ...cur,
      ...partial,
      updatedAt: new Date().toISOString(),
    });
  }

  private makeTag(id: string): string {
    const sha = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
    return `${this.deployments.get(id)!.name}:${sha}`;
  }

  private makeUrl(id: string): string {
    const slug = this.deployments
      .get(id)!
      .name.toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `https://${slug || "app"}.dpl.local.test`;
  }

  private deriveName(input: CreateDeploymentInput): string | null {
    if (input.gitUrl) {
      const m = input.gitUrl.match(/\/([^/]+?)(\.git)?$/);
      if (m) return m[1];
    }
    if (input.file) {
      return input.file.name.replace(/\.(zip|tar|tgz|tar\.gz)$/i, "");
    }
    return null;
  }
}

export const mockStore = new MockStore();
