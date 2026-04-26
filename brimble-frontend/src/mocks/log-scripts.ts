import type { LogLine } from "../lib/types";

export interface ScriptStep {
  stream: LogLine["stream"];
  message: string;
  delayMs: number;
}

export const buildScript: ScriptStep[] = [
  { stream: "build", message: "[railpack] resolving project type…", delayMs: 350 },
  { stream: "build", message: "[railpack] detected runtime: node@20 (package.json)", delayMs: 500 },
  { stream: "build", message: "[railpack] generating build plan", delayMs: 300 },
  { stream: "build", message: "[builder] FROM ghcr.io/railwayapp/railpack-node:20", delayMs: 400 },
  { stream: "build", message: "[builder] COPY package*.json ./", delayMs: 250 },
  { stream: "build", message: "[builder] RUN npm ci --include=dev", delayMs: 1300 },
  { stream: "build", message: "[builder] added 287 packages in 11s", delayMs: 700 },
  { stream: "build", message: "[builder] COPY . .", delayMs: 250 },
  { stream: "build", message: "[builder] RUN npm run build", delayMs: 1100 },
  { stream: "build", message: "[builder] vite v8 building for production…", delayMs: 500 },
  { stream: "build", message: "[builder] ✓ 124 modules transformed", delayMs: 700 },
  { stream: "build", message: "[builder] image built", delayMs: 350 },
];

export const deployScript: ScriptStep[] = [
  { stream: "deploy", message: "[orchestrator] pulling image", delayMs: 450 },
  { stream: "deploy", message: "[orchestrator] image ready", delayMs: 350 },
  { stream: "deploy", message: "[orchestrator] starting container", delayMs: 550 },
  { stream: "deploy", message: "[caddy] registering route -> :3000", delayMs: 350 },
  { stream: "deploy", message: "[caddy] config reload ok", delayMs: 300 },
  { stream: "deploy", message: "[orchestrator] health check passed (200 OK)", delayMs: 450 },
];

export const runtimeStartScript: ScriptStep[] = [
  { stream: "runtime", message: "listening on :3000", delayMs: 200 },
  { stream: "runtime", message: "ready to accept connections", delayMs: 250 },
];

export const failingBuildScript: ScriptStep[] = [
  { stream: "build", message: "[railpack] resolving project type…", delayMs: 350 },
  { stream: "build", message: "[railpack] detected runtime: node@20 (package.json)", delayMs: 500 },
  { stream: "build", message: "[builder] RUN npm ci --include=dev", delayMs: 900 },
  { stream: "build", message: "[builder] npm error code ELIFECYCLE", delayMs: 700 },
  { stream: "build", message: "[builder] npm error errno 1", delayMs: 200 },
  { stream: "build", message: "[builder] FAILED: build exited with code 1", delayMs: 350 },
];
