import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Absolute content globs so class scanning works regardless of the cwd the dev
// server is launched from.
const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [resolve(here, 'index.html'), resolve(here, 'src/**/*.{ts,tsx}')],
  theme: {
    extend: {
      colors: {
        // Foren finalized palette
        plum: '#5B3A5C', // primary
        gold: '#E8B96D', // secondary accent
        background: '#1A1A1A', // near-black
        surface: '#2A2A2A', // dark grey card
        primary: '#F5F0E8', // warm off-white (text primary)
        secondary: '#A89F91', // muted beige (text secondary)
        danger: '#D35E5E', // error / critical
        success: '#6BAF7B', // success / low severity
        // severity scale
        severity: {
          critical: '#D35E5E',
          high: '#E8955E',
          medium: '#E8B96D',
          low: '#6BAF7B',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      maxWidth: {
        // mobile-first canvas (375px–428px)
        app: '428px',
      },
    },
  },
  plugins: [],
};
