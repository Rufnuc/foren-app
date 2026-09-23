// Startup splash shown before the decoy game (spec: the app must read as an
// ordinary casual game from the very first frame). It is deliberately generic —
// an abstract tile motif plus the "Puzzle" wordmark (the app's own name) — so it
// fits whichever disguise the user picked (2048 / Sudoku / Wordle) and the
// onboarding screen alike. It also covers the brief app init. Nothing here
// reveals Foren.

// Four tiles in the app's warm palette, arranged 2×2, popping in staggered.
const TILES = ['#5B3A5C', '#6E4A6F', '#B97B45', '#E8955E'];

export function PuzzleSplash({ fadingOut }: { fadingOut: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background transition-opacity duration-500"
      style={{ opacity: fadingOut ? 0 : 1 }}
    >
      <style>{`
        @keyframes splashPop {
          0%   { transform: scale(0) rotate(-8deg); opacity: 0; }
          60%  { transform: scale(1.12) rotate(0deg); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes splashDot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-4px); }
        }
      `}</style>

      <div className="grid grid-cols-2 gap-2">
        {TILES.map((bg, i) => (
          <div
            key={i}
            className="h-12 w-12 rounded-lg shadow-lg"
            style={{
              background: bg,
              animation: 'splashPop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
              animationDelay: `${i * 110}ms`,
            }}
          />
        ))}
      </div>

      <div className="mt-6 text-2xl font-bold tracking-tight text-primary">Let&rsquo;s play</div>

      <div className="mt-5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{
              background: '#E8B96D',
              animation: 'splashDot 1.2s ease-in-out infinite',
              animationDelay: `${i * 160}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
