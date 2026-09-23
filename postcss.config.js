import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Resolve Tailwind's config explicitly relative to THIS file so the dev server
// works even when launched from a different cwd (the preview panel runs from
// the workspace root, not this project root).
const here = dirname(fileURLToPath(import.meta.url));

export default {
  plugins: [tailwindcss({ config: resolve(here, 'tailwind.config.js') }), autoprefixer],
};
