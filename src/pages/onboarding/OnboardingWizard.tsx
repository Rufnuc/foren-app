import { useState } from 'react';
import type { WizardDraft } from './types';
import { ChooseGameStep } from './steps/ChooseGameStep';
import { CreatePasscodeStep } from './steps/CreatePasscodeStep';
import { RecoverySetupStep } from './steps/RecoverySetupStep';
import { RecoveryDryRunStep } from './steps/RecoveryDryRunStep';
import { DuressSetupStep } from './steps/DuressSetupStep';
import { AddToHomeStep } from './steps/AddToHomeStep';
import { FirstUnlockStep } from './steps/FirstUnlockStep';

const INITIAL_DRAFT: WizardDraft = {
  game: 'game2048',
  symbol: 'star',
  passcode: '',
  passcodeKind: 'pin',
  recovery: null,
  duress: null,
};

const STEPS = [
  ChooseGameStep,
  CreatePasscodeStep,
  RecoverySetupStep,
  RecoveryDryRunStep,
  DuressSetupStep,
  AddToHomeStep,
  FirstUnlockStep,
];

// Orchestrates the 7-step onboarding (spec Part 1). Choices accumulate in a
// draft and are committed atomically at the final first-unlock step.
export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(INITIAL_DRAFT);

  const update = (patch: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const onNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const onBack = () => setStep((s) => Math.max(s - 1, 0));

  const StepComponent = STEPS[step];
  return <StepComponent draft={draft} update={update} onNext={onNext} onBack={onBack} />;
}
