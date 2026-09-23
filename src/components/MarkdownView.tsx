import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Maps the legal markdown filenames (used in cross-document links) to in-app
// routes so e.g. [Privacy Policy](PRIVACY_POLICY.md) navigates inside the app.
const FILE_TO_SLUG: Record<string, string> = {
  'PRIVACY_POLICY.md': 'privacy',
  'TERMS_OF_SERVICE.md': 'terms',
  'DATA_RIGHTS_GDPR.md': 'gdpr',
  'ACCEPTABLE_USE_POLICY.md': 'acceptable-use',
  'COOKIE_POLICY.md': 'cookies',
  'DISCLAIMER.md': 'disclaimer',
  'EULA.md': 'eula',
};

// Themed markdown renderer (lazy-loaded; pulls in react-markdown only when a
// legal document is opened).
export default function MarkdownView({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-3 mt-2 text-xl font-semibold text-primary">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-6 text-lg font-semibold text-primary">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-4 text-base font-semibold text-primary">{children}</h3>,
        p: ({ children }) => <p className="my-2 text-sm leading-relaxed text-secondary">{children}</p>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-sm text-secondary">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-sm text-secondary">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-secondary">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-gold/50 pl-3 text-sm italic text-secondary">{children}</blockquote>
        ),
        code: ({ children }) => <code className="rounded bg-background px-1 py-0.5 text-xs text-gold">{children}</code>,
        hr: () => <hr className="my-4 border-white/10" />,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => <th className="border border-white/10 px-2 py-1 text-left text-primary">{children}</th>,
        td: ({ children }) => <td className="border border-white/10 px-2 py-1 align-top text-secondary">{children}</td>,
        a: ({ href, children }) => {
          const file = href?.split('/').pop() ?? '';
          const slug = FILE_TO_SLUG[file];
          if (slug) {
            return (
              <Link to={`/vault/legal/${slug}`} className="text-gold underline">
                {children}
              </Link>
            );
          }
          return (
            <a href={href} target="_blank" rel="noreferrer" className="text-gold underline">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
