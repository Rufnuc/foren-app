import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer actions row. */
  footer?: ReactNode;
}

// Bottom-sheet style modal, mobile-first. Closes on Escape / backdrop tap.
export function Modal({ title, onClose, children, footer }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-app overflow-y-auto rounded-t-2xl bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="px-2 text-xl text-secondary">
            ×
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex gap-3">{footer}</div>}
      </div>
    </div>
  );
}
