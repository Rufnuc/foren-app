// UK crisis numbers (see spec Part 2.12). Rendered as real tel: links so a
// survivor can reach help in one tap. Kept presentational and dependency-free.

interface CrisisContact {
  label: string;
  number: string;
  tel: string;
}

const CONTACTS: CrisisContact[] = [
  { label: 'Emergency', number: '999', tel: '999' },
  { label: 'National Stalking Helpline', number: '0808 802 0300', tel: '08088020300' },
  { label: 'Refuge (domestic abuse)', number: '0808 2000 247', tel: '08082000247' },
  { label: 'Samaritans', number: '116 123', tel: '116123' },
];

export function CrisisBanner() {
  return (
    <div className="card border border-danger/30" role="region" aria-label="Crisis support">
      <p className="mb-3 text-sm font-semibold text-primary">Need help now?</p>
      <ul className="space-y-2">
        {CONTACTS.map((c) => (
          <li key={c.tel}>
            <a
              href={`tel:${c.tel}`}
              className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm hover:bg-black/40"
            >
              <span className="text-secondary">{c.label}</span>
              <span className="font-semibold text-gold">{c.number}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
