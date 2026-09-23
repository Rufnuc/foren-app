import type { GameType, SymbolType, RecoveryMethod, DuressState } from '@/types';
import type { PasscodeKind } from '@/lib/crypto';

export interface RecoveryDraft {
  method: RecoveryMethod;
  secret: string; // base32 string, or space-joined words
}

export interface DuressDraft {
  passcode: string;
  state: DuressState;
}

// Everything the wizard collects before it is committed atomically at the
// final first-unlock step.
export interface WizardDraft {
  game: GameType;
  symbol: SymbolType;
  passcode: string;
  passcodeKind: PasscodeKind;
  recovery: RecoveryDraft | null;
  duress: DuressDraft | null;
}

export interface StepProps {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  onNext: () => void;
  onBack: () => void;
}
