import { parseEnvText } from "./env";
import type {
  BackendContainerStatus,
  BackendDeployment,
  BackendDeploymentImage,
  BackendEnvelope,
  CreateDeploymentInput,
  Deployment,
  DeploymentImage,
  DeploymentStatus,
  UpdateSourceInput,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/$/, "");

export const LOG_SEPARATOR = "[owoade_brimble_log_separator]";

const KNOWN_STATUSES: DeploymentStatus[] = [
  "pending",
  "building",
  "deploying",
  "running",
  "failed",
];

function normalizeStatus(s: string): DeploymentStatus {
  const lower = s.toLowerCase() as DeploymentStatus;
  return KNOWN_STATUSES.includes(lower) ? lower : "pending";
}

function adaptDeployment(b: BackendDeployment): Deployment {
  const status = normalizeStatus(b.status);
  return {
    id: String(b.id),
    name: b.name,
    slug: b.slug,
    status,
    env: b.env ? parseEnvText(b.env) : {},
    imageTag: b.current_image || null,
    containerName: b.container_name || null,
    url: status === "running" && b.slug ? `http://${b.slug}.localhost` : null,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    errorMessage: null,
  };
}

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

  async listDeployments(): Promise<Deployment[]> {
    const res = await fetch(`${API_BASE}/deployments`);
    const body = await handle<BackendEnvelope<BackendDeployment[]>>(res);
    return (body.data ?? []).map(adaptDeployment);
  },

  async getDeployment(slug: string): Promise<Deployment> {
    const res = await fetch(`${API_BASE}/deployment/${slug}`);
    const body = await handle<BackendEnvelope<BackendDeployment>>(res);
    return adaptDeployment(body.data);
  },

  async getDeploymentStatus(slug: string): Promise<BackendContainerStatus> {
    const res = await fetch(`${API_BASE}/deployment/${slug}/status`);
    const body = await handle<BackendEnvelope<BackendContainerStatus>>(res);
    return body.data;
  },

  async getDeploymentLogs(slug: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/deployment/${slug}/logs`);
    const body = await handle<BackendEnvelope<string[]>>(res);
    return body.data ?? [];
  },

  async getRuntimeLogs(slug: string): Promise<string[]> {
    const res = await fetch(`${API_BASE}/deployment/${slug}/runtime-logs`);
    const body = await handle<BackendEnvelope<string[]>>(res);
    return body.data ?? [];
  },

  async getDeploymentImages(slug: string): Promise<DeploymentImage[]> {
    const res = await fetch(`${API_BASE}/deployment/${slug}/images`);
    const body = await handle<BackendEnvelope<BackendDeploymentImage[]>>(res);
    return (body.data ?? []).map((b) => ({
      id: String(b.id),
      imageTag: b.image_tag,
      createdAt: b.created_at,
    }));
  },

  createDeploymentStream(
    input: CreateDeploymentInput,
    signal?: AbortSignal,
  ): Promise<Response> {
    const form = new FormData();
    form.append("name", input.name);
    form.append("type", input.type);
    if (input.envText && input.envText.trim()) form.append("env", input.envText);
    if (input.type === "github" && input.githubLink) {
      form.append("github_link", input.githubLink);
    }
    if (input.type === "zip-upload" && input.file) {
      form.append("file", input.file);
    }
    return fetch(`${API_BASE}/deployment`, {
      method: "POST",
      body: form,
      signal,
    });
  },

  async deleteDeployment(slug: string): Promise<void> {
    const res = await fetch(`${API_BASE}/deployment/${slug}`, {
      method: "DELETE",
    });
    await handle<unknown>(res);
  },

  rollbackStream(
    slug: string,
    imageId: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${API_BASE}/deployment/${slug}/rollback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image_id: imageId }),
      signal,
    });
  },

  updateEnvStream(
    slug: string,
    envText: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(`${API_BASE}/deployment/${slug}/env`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ env: envText }),
      signal,
    });
  },

  updateSourceStream(
    slug: string,
    input: UpdateSourceInput,
    signal?: AbortSignal,
  ): Promise<Response> {
    const form = new FormData();
    form.append("type", input.type);
    if (input.type === "github" && input.githubLink) {
      form.append("github_link", input.githubLink);
    }
    if (input.type === "zip-upload" && input.file) {
      form.append("file", input.file);
    }
    return fetch(`${API_BASE}/deployment/${slug}/source`, {
      method: "POST",
      body: form,
      signal,
    });
  },
};
