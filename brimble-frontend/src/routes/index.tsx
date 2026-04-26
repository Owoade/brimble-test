import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DeploymentList } from "../components/DeploymentList";
import { NewDeploymentModal } from "../components/NewDeploymentModal";
import { DeploymentDetailModal } from "../components/DeploymentDetailModal";
import { useDeployments } from "../lib/queries";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data: deployments = [], isLoading, error } = useDeployments();
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const opened = deployments.find((d) => d.id === openId) ?? null;

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Deployments</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {deployments.length} total · click a row to view logs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="rounded-md bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-sm font-medium px-3.5 py-2 transition"
          >
            + New deployment
          </button>
        </div>

        <DeploymentList
          deployments={deployments}
          onSelect={(id) => setOpenId(id)}
          isLoading={isLoading}
          error={error}
        />
      </div>

      <NewDeploymentModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(d) => setOpenId(d.id)}
      />

      <DeploymentDetailModal
        deployment={opened}
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}
