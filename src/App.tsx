import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from '@/lib/queryClient';
import { router } from '@/routes/router';
import { ErrorBoundary, SecureContextGuard, PuzzleSplash } from '@/components';
import { useVaultStore } from '@/store/vaultStore';
import { initUsage } from '@/usage';

// Minimum time the "Puzzle" game-intro splash stays up, so a fast init still
// looks like a game booting rather than a flicker.
const SPLASH_MIN_MS = 1600;
const SPLASH_FADE_MS = 500;

// Loads persisted config + guard state from secure storage before routing. A
// game-branded splash covers this (and never reveals Foren). We keep the real
// app mounted underneath once initialised so the splash fades away to reveal it,
// and never flash onboarding for a device that actually has a vault.
function Boot({ children }: { children: ReactNode }) {
  const initialized = useVaultStore((s) => s.initialized);
  const init = useVaultStore((s) => s.init);
  const [minElapsed, setMinElapsed] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // Once the app has initialised, ensure the anonymous usage identity exists
  // and flush any counters pending from a previous session. Best-effort and
  // fully isolated from the vault — see src/usage/.
  useEffect(() => {
    if (initialized) void initUsage();
  }, [initialized]);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  const ready = initialized && minElapsed;

  // Once ready, run the fade-out, then unmount the splash.
  useEffect(() => {
    if (!ready || splashGone) return;
    const t = setTimeout(() => setSplashGone(true), SPLASH_FADE_MS);
    return () => clearTimeout(t);
  }, [ready, splashGone]);

  return (
    <>
      {initialized ? children : <div className="min-h-screen bg-background" />}
      {!splashGone && <PuzzleSplash fadingOut={ready} />}
    </>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <SecureContextGuard>
        <Boot>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </Boot>
      </SecureContextGuard>
    </ErrorBoundary>
  );
}
