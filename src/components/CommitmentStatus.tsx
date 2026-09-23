import type { CommitmentStatus as CommitmentStatusType } from '@/types';

interface CommitmentStatusProps {
  status: CommitmentStatusType;
  onClick?: () => void;
}

const CONFIG: Record<CommitmentStatusType, { icon: string; label: string; className: string }> = {
  pending: { icon: '⏳', label: 'Pending', className: 'text-secondary' },
  solana: { icon: '◎', label: 'Solana', className: 'text-gold' },
  bitcoin: { icon: '🔗', label: 'Bitcoin', className: 'text-gold' },
};

export function CommitmentStatus({ status, onClick }: CommitmentStatusProps) {
  const { icon, label, className } = CONFIG[status];
  const content = (
    <>
      <span aria-hidden="true">{icon}</span> {label}
    </>
  );

  if (!onClick) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${className}`}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Commitment status: ${label}. View proof chain.`}
      className={`inline-flex items-center gap-1 rounded px-1 text-xs font-semibold hover:underline ${className}`}
    >
      {content}
    </button>
  );
}
