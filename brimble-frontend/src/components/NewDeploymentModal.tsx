import { Modal } from "./Modal";
import { DeploymentForm } from "./DeploymentForm";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}

export function NewDeploymentModal({ open, onClose, onCreated }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="New deployment" size="md">
      <div className="overflow-y-auto p-5">
        <DeploymentForm
          embedded
          onCreated={(id) => {
            onCreated?.(id);
            onClose();
          }}
        />
      </div>
    </Modal>
  );
}
