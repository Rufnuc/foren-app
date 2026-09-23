import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { useVaultStore } from '@/store/vaultStore';
import { OnboardingWizard } from '@/pages/onboarding/OnboardingWizard';
import { LockScreen } from '@/pages/LockScreen';
import { Vault } from '@/pages/Vault';
import { CaseDetail } from '@/pages/CaseDetail';
import { Experience } from '@/pages/Experience';
import { Report } from '@/pages/Report';
import { Verify } from '@/pages/Verify';
import { Settings } from '@/pages/Settings';
import { Help } from '@/pages/Help';
import { Legal } from '@/pages/Legal';
import { LegalDoc } from '@/pages/LegalDoc';

// Entry gate: decides what the root path shows based on vault state.
//   no vault            → onboarding
//   vault, locked       → decoy game (lock screen)
//   vault, unlocked     → the real vault
function Gate() {
  const hasVault = useVaultStore((s) => s.hasVault);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);

  if (!hasVault) return <OnboardingWizard />;
  if (!isUnlocked) return <LockScreen />;
  return <Navigate to="/vault" replace />;
}

// Guards the real vault routes. While locked we fall back to the disguise.
function RequireUnlocked() {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  if (!isUnlocked) return <Navigate to="/" replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/', element: <Gate /> },
  // Verification is public — no unlock required (spec Part 2.10).
  { path: '/vault/verify', element: <Verify /> },
  {
    element: <RequireUnlocked />,
    children: [
      { path: '/vault', element: <Vault /> },
      { path: '/vault/case/:caseId', element: <CaseDetail /> },
      { path: '/vault/case/:caseId/experience', element: <Experience /> },
      { path: '/vault/case/:caseId/report', element: <Report /> },
      { path: '/vault/settings', element: <Settings /> },
      { path: '/vault/help', element: <Help /> },
      { path: '/vault/legal', element: <Legal /> },
      { path: '/vault/legal/:slug', element: <LegalDoc /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
