export type DeploymentStatus =
  | "pending"
  | "building"
  | "deploying"
  | "running"
  | "failed";

export type DeploymentSource =
  | { type: "github"; githubLink: string }
  | { type: "zip-upload"; filename: string };

export interface Build {
  id: string;
  imageTag: string;
  status: "succeeded" | "failed";
  createdAt: string;
}

export interface Deployment {
  id: string;
  name: string;
  slug?: string;
  status: DeploymentStatus;
  source?: DeploymentSource;
  imageTag: string | null;
  containerName?: string | null;
  url: string | null;
  env: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string | null;
  builds?: Build[];
}

export interface BackendDeployment {
  id: number | string;
  name: string;
  slug: string;
  env: string;
  current_image: string;
  container_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BackendEnvelope<T> {
  data: T;
  status: boolean;
}

export interface BackendContainerStatus {
  Status: string;
  Running: boolean;
  Pid: number;
}

export interface BackendDeploymentImage {
  id: number;
  project_id: number;
  image_tag: string;
  created_at: string;
}

export interface DeploymentImage {
  id: string;
  imageTag: string;
  createdAt: string;
}

export interface LogLine {
  ts: number;
  level: string;
  message: string;
}

export interface CreateDeploymentInput {
  name: string;
  type: "github" | "zip-upload";
  file?: File | null;
  envText?: string;
  githubLink?: string;
}

export interface UpdateSourceInput {
  type: "github" | "zip-upload";
  file?: File | null;
  githubLink?: string;
}
