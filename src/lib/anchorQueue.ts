import { queryClient } from './queryClient';
import { getCommitment, anchorToSolana, anchorToBitcoin } from '@/data/repository';

// Debounced anchoring. Committing the Merkle root on every upload is free and
// instant (local), but the on-chain anchor costs a transaction — so we coalesce
// a burst of uploads into ONE anchor instead of one per file (real savings on
// mainnet). The commit is immediate; only the network anchor waits out the
// quiet window. Best-effort: an offline relay just leaves it pending for the
// next commit to retry.

const DEBOUNCE_MS = 6000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Call after each upload/commit; anchors once the uploads settle. */
export function scheduleAnchor(caseId: string): void {
  const existing = timers.get(caseId);
  if (existing) clearTimeout(existing);
  timers.set(
    caseId,
    setTimeout(() => {
      timers.delete(caseId);
      void anchorNow(caseId);
    }, DEBOUNCE_MS),
  );
}

async function anchorNow(caseId: string): Promise<void> {
  const c = await getCommitment(caseId);
  if (!c) return;
  // Only anchor what isn't anchored yet at the current root.
  if (c.status !== 'solana') {
    try {
      await anchorToSolana(caseId);
    } catch {
      /* offline / relay down — stays pending */
    }
  }
  if (!c.bitcoinOts) {
    try {
      await anchorToBitcoin(caseId);
    } catch {
      /* OpenTimestamps unavailable — left un-stamped */
    }
  }
  queryClient.invalidateQueries({ queryKey: ['commitment', caseId] });
}
