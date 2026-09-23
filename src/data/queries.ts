import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVaultStore } from '@/store/vaultStore';
import * as repo from './repository';
import type { CaseInput, EvidenceInput, AccountInput } from './repository';
import { scheduleAnchor } from '@/lib/anchorQueue';

// All vault data is keyed on the in-memory AES key. Queries stay disabled until
// the vault is unlocked (key present), so we never touch ciphertext without it.

export function useCases(includeDeleted = false) {
  const key = useVaultStore((s) => s.encryptionKey);
  return useQuery({
    queryKey: ['cases', includeDeleted],
    enabled: !!key,
    queryFn: () => repo.listCases(key!, includeDeleted),
  });
}

export function useCase(id: string | undefined) {
  const key = useVaultStore((s) => s.encryptionKey);
  return useQuery({
    queryKey: ['case', id],
    enabled: !!key && !!id,
    // React Query rejects undefined; coalesce a missing case to null.
    queryFn: async () => (await repo.getCase(key!, id!)) ?? null,
  });
}

export function useEvidence(caseId: string | undefined) {
  const key = useVaultStore((s) => s.encryptionKey);
  return useQuery({
    queryKey: ['evidence', caseId],
    enabled: !!key && !!caseId,
    queryFn: () => repo.listEvidence(key!, caseId!),
  });
}

export function useCreateCase() {
  const key = useVaultStore((s) => s.encryptionKey);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CaseInput) => repo.createCase(key!, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useAddEvidence(caseId: string) {
  const key = useVaultStore((s) => s.encryptionKey);
  const qc = useQueryClient();
  return useMutation({
    // Everything happens automatically on upload: store → (re)commit the Merkle
    // root (instant, local) → schedule a debounced anchor. Committing is free and
    // per-upload; the on-chain anchor (Solana + Bitcoin) is coalesced across a
    // burst of uploads so we don't pay per file. The proof surfaces only in the
    // generated report.
    mutationFn: async (input: EvidenceInput) => {
      const ev = await repo.addEvidence(key!, input);
      await repo.commitCase(key!, caseId);
      scheduleAnchor(caseId);
      return ev;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evidence', caseId] });
      qc.invalidateQueries({ queryKey: ['cases'] }); // counts / severity
      qc.invalidateQueries({ queryKey: ['case', caseId] });
      qc.invalidateQueries({ queryKey: ['commitment', caseId] });
    },
  });
}

export function useDeleteEvidence(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.deleteEvidence(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evidence', caseId] });
      qc.invalidateQueries({ queryKey: ['cases'] });
      qc.invalidateQueries({ queryKey: ['case', caseId] });
    },
  });
}

export function useAccount(caseId: string | undefined) {
  const key = useVaultStore((s) => s.encryptionKey);
  return useQuery({
    queryKey: ['account', caseId],
    enabled: !!key && !!caseId,
    queryFn: async () => (await repo.getAccount(key!, caseId!)) ?? null,
  });
}

export function useSaveAccount(caseId: string) {
  const key = useVaultStore((s) => s.encryptionKey);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountInput) => repo.saveAccount(key!, caseId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account', caseId] }),
  });
}

export function useCommitment(caseId: string | undefined) {
  return useQuery({
    queryKey: ['commitment', caseId],
    enabled: !!caseId,
    queryFn: async () => (await repo.getCommitment(caseId!)) ?? null,
  });
}

export function useCommitCase(caseId: string) {
  const key = useVaultStore((s) => s.encryptionKey);
  const qc = useQueryClient();
  return useMutation({
    // Re-run the on-device model over the evidence first so the committed
    // snapshot (and the report/bundle) reflect the current analysis.
    mutationFn: async () => {
      await repo.reanalyzeEvidence(key!, caseId);
      return repo.commitCase(key!, caseId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commitment', caseId] });
      qc.invalidateQueries({ queryKey: ['evidence', caseId] });
      qc.invalidateQueries({ queryKey: ['case', caseId] });
    },
  });
}

export function useAnchorSolana(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => repo.anchorToSolana(caseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['commitment', caseId] });
      qc.invalidateQueries({ queryKey: ['evidence', caseId] });
    },
  });
}

export function useAnchorBitcoin(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => repo.anchorToBitcoin(caseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commitment', caseId] }),
  });
}

export function useRefreshBitcoin(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => repo.refreshBitcoin(caseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commitment', caseId] }),
  });
}

export function useSoftDeleteCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.softDeleteCase(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function useRestoreCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.restoreCase(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}

export function usePurgeCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => repo.purgeCase(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });
}
