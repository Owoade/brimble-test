import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Size = "sm" | "md" | "lg" | "xl";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: Size;
  children: ReactNode;
}

const sizeMap: Record<Size, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({ open, onClose, title, size = "md", children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${sizeMap[size]} max-h-[90vh] flex flex-col rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl overflow-hidden`}
      >
        {title && (
          <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-neutral-400 hover:text-neutral-200 text-xl leading-none px-1"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
