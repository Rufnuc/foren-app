// Shared domain types for the Foren vault.
// These mirror the export bundle schema (see spec Appendix B) and the
// component props described in Part 2. Kept central so the UI, store, and
// (eventually) the API layer agree on shapes.

export type GameType = 'game2048' | 'sudoku' | 'wordle';

export type RecoveryMethod = 'authenticator' | 'printed' | 'words';

/** Unlock-gesture symbol the user draws on the decoy game. */
export type SymbolType = 'star' | 'diamond' | 'check' | 'circle';

export type DuressState = 'return-to-game' | 'empty-vault';

export type EvidenceType = 'message' | 'screenshot' | 'audio' | 'transcript';

export type CommitmentStatus = 'pending' | 'solana' | 'bitcoin';

/** Numeric severity: 1 Low … 4 Critical. */
export type SeverityLevel = 1 | 2 | 3 | 4;

export type SeverityLabel = 'low' | 'medium' | 'high' | 'critical';

export interface EvidenceItem {
  id: string;
  caseId: string;
  type: EvidenceType;
  /** Claimed timestamp (epoch ms). Device clock; not authoritative. */
  timestamp: number;
  /** Decrypted content preview/body (never persisted in plaintext). */
  content: string;
  severity: SeverityLabel;
  severityNumeric: SeverityLevel;
  patternTags: string[];
  commitmentStatus: CommitmentStatus;
  createdAt: number;
  /** True when an encrypted image/audio attachment is stored (fetched lazily). */
  hasMedia: boolean;
  mediaType?: string; // MIME type of the attachment
}

/** One answer to a guided prompt in an experience account. */
export interface PromptAnswer {
  promptId: string;
  question: string;
  answer: string;
}

/**
 * The survivor's own account of their experience, in their own words — the
 * context that individual evidence items lack (e.g. why a neutral-looking
 * message is part of a controlling pattern). One per case. Stored encrypted like
 * all vault data, and treated as the person's statement: assistive analysis is
 * derived from it, but it is never machine-generated evidence.
 */
export interface ExperienceAccount {
  caseId: string;
  promptAnswers: PromptAnswer[];
  narrative: string;
  createdAt: number;
  updatedAt: number;
}

export interface CaseSummary {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  startDate: number;
  evidenceCount: number;
  severityMax: SeverityLabel;
  /** Set when soft-deleted; recovery available until this epoch ms. */
  deletedAt?: number;
}
