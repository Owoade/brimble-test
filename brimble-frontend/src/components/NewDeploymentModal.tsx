import { Modal } from "./Modal";
import { DeploymentForm } from "./DeploymentForm";
import type { Deployment } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (d: Deployment) => void;
}

export function NewDeploymentModal({ open, onClose, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="New deployment" size="md">
      <div className="overflow-y-auto p-5">
        <DeploymentForm
          embedded
          onCreated={(d) => {
            onCreated?.(d);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}
