import type { CapacitorConfig } from '@capacitor/cli';

// Native shell config. The visible app name / icon must read as the decoy game
// ("Puzzle"), never "Foren" — the home screen is the first thing an onlooker
// sees. Set the bundle id and display name to your own before publishing; keep
// them disguise-safe.
const config: CapacitorConfig = {
  appId: 'com.puzzle.slide',
  appName: 'Puzzle',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
  android: {
    // Allow the WebView to use a secure (https) origin so crypto.subtle works.
    allowMixedContent: false,
  },
};

export default config;
