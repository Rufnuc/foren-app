import { Link } from 'react-router-dom';
import { SafetyExit } from '@/components';
import { LEGAL_DOCS } from '@/legal';

// Legal index (reached from Settings → About → Legal).
export function Legal() {
  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/vault/settings" className="text-gold" aria-label="Back to settings">←</Link>
        <h1 className="text-lg font-semibold text-primary">Legal</h1>
      </header>

      <div className="flex flex-col gap-3">
        {LEGAL_DOCS.map((doc) => (
          <Link
            key={doc.slug}
            to={`/vault/legal/${doc.slug}`}
            className="card flex items-center gap-3 hover:bg-surface/80"
          >
            <span className="flex-1">
              <span className="block font-semibold text-primary">{doc.title}</span>
              <span className="block text-xs text-secondary">{doc.summary}</span>
            </span>
            <span className="text-gold" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>

      <SafetyExit />
    </div>
  );
}
