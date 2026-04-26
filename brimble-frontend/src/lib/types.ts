export type DeploymentStatus =
  | "pending"
  | "building"
  | "deploying"
  | "running"
  | "failed";

export type DeploymentSource =
  | { type: "git"; repo: string; branch?: string }
  | { type: "upload"; filename: string };

export interface Build {
  id: string;
  imageTag: string;
  status: "succeeded" | "failed";
  createdAt: string;
}

export interface Deployment {
  id: string;
  name: string;
  status: DeploymentStatus;
  source: DeploymentSource;
  imageTag: string | null;
  url: string | null;
  env: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string | null;
  builds: Build[];
}

export interface LogLine {
  ts: string;
  stream: "build" | "deploy" | "runtime";
  message: string;
}

export interface CreateDeploymentInput {
  name?: string;
  gitUrl?: string;
  branch?: string;
  file?: File | null;
  env: Record<string, string>;
}
