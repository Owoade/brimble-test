import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "./api";
import type { CreateDeploymentInput, Deployment } from "./types";

export const deploymentKeys = {
  all: ["deployments"] as const,
  list: () => [...deploymentKeys.all, "list"] as const,
  detail: (id: string) => [...deploymentKeys.all, "detail", id] as const,
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

export function useCreateDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeploymentInput) => api.createDeployment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deploymentKeys.list() });
    },
  });
}

export function useRedeploy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, buildId }: { id: string; buildId?: string }) =>
      api.redeploy(id, buildId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: deploymentKeys.list() });
      qc.invalidateQueries({ queryKey: deploymentKeys.detail(data.id) });
    },
  });
}

export function useUpdateEnv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, env }: { id: string; env: Record<string, string> }) =>
      api.updateEnv(id, env),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: deploymentKeys.list() });
      qc.invalidateQueries({ queryKey: deploymentKeys.detail(data.id) });
    },
  });
}
