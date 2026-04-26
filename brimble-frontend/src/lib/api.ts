import type { CreateDeploymentInput, Deployment } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  baseUrl: API_BASE,

  listDeployments(): Promise<Deployment[]> {
    return fetch(`${API_BASE}/deployments`).then(handle<Deployment[]>);
  },

  getDeployment(id: string): Promise<Deployment> {
    return fetch(`${API_BASE}/deployments/${id}`).then(handle<Deployment>);
  },

  async createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
    const form = new FormData();
    if (input.name) form.append("name", input.name);
    if (input.gitUrl) form.append("gitUrl", input.gitUrl);
    if (input.branch) form.append("branch", input.branch);
    form.append("env", JSON.stringify(input.env));
    if (input.file) form.append("file", input.file);

    const res = await fetch(`${API_BASE}/deployments`, {
      method: "POST",
      body: form,
    });
    return handle<Deployment>(res);
  },

  async redeploy(id: string, buildId?: string): Promise<Deployment> {
    const res = await fetch(`${API_BASE}/deployments/${id}/redeploy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildId ? { buildId } : {}),
    });
    return handle<Deployment>(res);
  },

  async updateEnv(id: string, env: Record<string, string>): Promise<Deployment> {
    const res = await fetch(`${API_BASE}/deployments/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ env }),
    });
    return handle<Deployment>(res);
  },

  logsUrl(id: string): string {
    const base = API_BASE.startsWith("http")
      ? API_BASE
      : `${window.location.origin}${API_BASE}`;
    return `${base}/deployments/${id}/logs/stream`;
  },
};
