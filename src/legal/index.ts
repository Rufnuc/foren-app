// Legal documents, imported as raw markdown from the project-root `legal/`
// folder so those files stay the single source of truth — edit them there
// (e.g. to fill in the [PLACEHOLDER] company details) and the app updates.

import privacy from '../../legal/PRIVACY_POLICY.md?raw';
import terms from '../../legal/TERMS_OF_SERVICE.md?raw';
import gdpr from '../../legal/DATA_RIGHTS_GDPR.md?raw';
import aup from '../../legal/ACCEPTABLE_USE_POLICY.md?raw';
import cookies from '../../legal/COOKIE_POLICY.md?raw';
import disclaimer from '../../legal/DISCLAIMER.md?raw';
import eula from '../../legal/EULA.md?raw';

export interface LegalDoc {
  slug: string;
  title: string;
  summary: string;
  content: string;
}

export const LEGAL_DOCS: LegalDoc[] = [
  { slug: 'terms', title: 'Terms of Service', summary: 'The agreement governing use of Foren.', content: terms },
  { slug: 'privacy', title: 'Privacy Policy', summary: 'What data is and isn’t processed, and your rights.', content: privacy },
  { slug: 'gdpr', title: 'Your Data Rights (GDPR)', summary: 'UK/EU GDPR rights and how local-first affects them.', content: gdpr },
  { slug: 'acceptable-use', title: 'Acceptable Use Policy', summary: 'Permitted and prohibited uses.', content: aup },
  { slug: 'cookies', title: 'Cookie & Local Storage Policy', summary: 'On-device storage and cookies.', content: cookies },
  { slug: 'disclaimer', title: 'Disclaimer', summary: 'Safety, AI, and evidence-admissibility limitations.', content: disclaimer },
  { slug: 'eula', title: 'End-User Licence Agreement', summary: 'Software licence terms.', content: eula },
];

export function getLegalDoc(slug: string | undefined): LegalDoc | undefined {
  return LEGAL_DOCS.find((d) => d.slug === slug);
}
