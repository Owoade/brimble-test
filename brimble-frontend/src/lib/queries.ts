import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type {
  BackendContainerStatus,
  Deployment,
  DeploymentImage,
} from "./types";

export const deploymentKeys = {
  all: ["deployments"] as const,
  list: () => [...deploymentKeys.all, "list"] as const,
  detail: (id: string) => [...deploymentKeys.all, "detail", id] as const,
  status: (slug: string) => [...deploymentKeys.all, "status", slug] as const,
  buildLogs: (slug: string) =>
    [...deploymentKeys.all, "logs", "build", slug] as const,
  runtimeLogs: (slug: string) =>
    [...deploymentKeys.all, "logs", "runtime", slug] as const,
  images: (slug: string) => [...deploymentKeys.all, "images", slug] as const,
};

export function useDeployments(
  options?: Partial<UseQueryOptions<Deployment[]>>,
) {
  return useQuery<Deployment[]>({
    queryKey: deploymentKeys.list(),
    queryFn: () => api.listDeployments(),
    refetchInterval: 3_000,
    ...options,
  });
}

export function useDeployment(id: string | undefined) {
  return useQuery<Deployment>({
    queryKey: deploymentKeys.detail(id ?? ""),
    queryFn: () => api.getDeployment(id!),
    enabled: Boolean(id),
    refetchInterval: 3_000,
  });
}

export function useDeploymentStatus(slug: string | undefined) {
  return useQuery<BackendContainerStatus>({
    queryKey: deploymentKeys.status(slug ?? ""),
    queryFn: () => api.getDeploymentStatus(slug!),
    enabled: Boolean(slug),
    refetchInterval: 5_000,
    retry: false,
  });
}

export type DeploymentLogSource = "runtime" | "build" | null;

export function useDeploymentLogs(
  slug: string | undefined,
  status: Deployment["status"] | undefined,
  override?: DeploymentLogSource,
) {
  const derived: DeploymentLogSource =
    !slug || !status
      ? null
      : status === "running"
        ? "runtime"
        : status === "failed" || status === "building" || status === "deploying"
          ? "build"
          : null;
  const source: DeploymentLogSource = override ?? derived;

  const query = useQuery<string[]>({
    queryKey:
      source === "runtime"
        ? deploymentKeys.runtimeLogs(slug ?? "")
        : deploymentKeys.buildLogs(slug ?? ""),
    queryFn: () =>
      source === "runtime"
        ? api.getRuntimeLogs(slug!)
        : api.getDeploymentLogs(slug!),
    enabled: Boolean(slug && source),
    refetchInterval: status === "building" ? 2_000 : false,
  });

  return { ...query, source };
}

export function useDeploymentImages(slug: string | undefined) {
  return useQuery<DeploymentImage[]>({
    queryKey: deploymentKeys.images(slug ?? ""),
    queryFn: () => api.getDeploymentImages(slug!),
    enabled: Boolean(slug),
  });
}




