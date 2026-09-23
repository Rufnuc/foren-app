interface LoadingSpinnerProps {
  label?: string;
  className?: string;
}

export function LoadingSpinner({ label = 'Loading…', className = '' }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-3 text-secondary ${className}`}>
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-secondary/30 border-t-gold"
        aria-hidden="true"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
