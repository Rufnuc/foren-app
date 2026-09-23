import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState, SafetyExit, LoadingSpinner, CaseCard, NewCaseModal } from '@/components';
import { useCases, useCreateCase, useSoftDeleteCase } from '@/data/queries';
import { useVaultStore } from '@/store/vaultStore';

// Case dashboard (spec 2.3): search, case cards with swipe-to-delete, empty
// state, and a floating New Case button.
export function Vault() {
  const navigate = useNavigate();
  const { data: cases, isLoading } = useCases();
  const createCase = useCreateCase();
  const softDelete = useSoftDeleteCase();
  // In the duress empty-vault decoy there is no key: present a clean, read-only
  // vault and hide anything that could leak the real vault or that duress exists.
  const duressMode = useVaultStore((s) => s.duressMode);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);

  const filtered = useMemo(() => {
    if (!cases) return [];
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) => c.title.toLowerCase().includes(q));
  }, [cases, search]);

  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary">Vault</h1>
        <nav className="flex gap-3 text-sm text-gold">
          {!duressMode && <Link to="/vault/settings">Settings</Link>}
          <Link to="/vault/help">Help</Link>
        </nav>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search cases…"
        className="mb-4 w-full rounded-xl bg-surface px-4 py-3 text-primary placeholder:text-secondary/60"
      />

      {isLoading ? (
        <LoadingSpinner label="Decrypting cases…" className="justify-center py-12" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🗂️"
          title={search ? 'No matching cases' : 'No cases yet'}
          description={search ? 'Try a different search.' : 'Create one to get started.'}
          action={
            !search && !duressMode ? (
              <button type="button" className="btn-primary" onClick={() => setShowNew(true)}>
                Create your first case
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <CaseCard
              key={c.id}
              summary={c}
              onOpen={() => navigate(`/vault/case/${c.id}`)}
              onDelete={() => softDelete.mutate(c.id)}
            />
          ))}
        </div>
      )}

      {!duressMode && (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          aria-label="New case"
          className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-plum text-2xl text-primary shadow-lg"
        >
          +
        </button>
      )}

      {showNew && !duressMode && (
        <NewCaseModal
          saving={createCase.isPending}
          onClose={() => setShowNew(false)}
          onCreate={(input) =>
            createCase.mutate(input, {
              onSuccess: (created) => {
                setShowNew(false);
                navigate(`/vault/case/${created.id}`);
              },
            })
          }
        />
      )}

      <SafetyExit />
    </div>
  );
}
