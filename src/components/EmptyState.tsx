import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-4 text-4xl opacity-70" aria-hidden="true">{icon}</div>}
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      {description && <p className="mt-2 max-w-xs text-sm text-secondary">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
