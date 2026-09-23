import { lazy, Suspense } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { SafetyExit, LoadingSpinner } from '@/components';
import { getLegalDoc } from '@/legal';

// react-markdown + remark-gfm only load when a document is opened.
const MarkdownView = lazy(() => import('@/components/MarkdownView'));

export function LegalDoc() {
  const { slug } = useParams();
  const doc = getLegalDoc(slug);
  if (!doc) return <Navigate to="/vault/legal" replace />;

  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/vault/legal" className="text-gold" aria-label="Back to legal">←</Link>
        <h1 className="truncate text-lg font-semibold text-primary">{doc.title}</h1>
      </header>

      <Suspense fallback={<LoadingSpinner label="Loading…" className="justify-center py-12" />}>
        <MarkdownView content={doc.content} />
      </Suspense>

      <SafetyExit />
    </div>
  );
}
