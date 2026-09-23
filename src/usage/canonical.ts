// Deterministic JSON serialization, shared shape with the relay's
// services/usage/canonical.ts. Two devices (or the client and the server) must
// produce byte-identical output for the same object so signatures and SHA-256
// commitments are reproducible.
//
// Rules (a small, explicit subset — NOT full RFC 8785, but deterministic and
// sufficient here): object keys sorted lexicographically by UTF-16 code unit,
// no insignificant whitespace, numbers must be finite integers, strings via
// JSON.stringify (standard escaping). Nested objects/arrays recurse.

export function canonicalize(value: unknown): string {
  return ser(value);
}

function ser(v: unknown): string {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(v as number) || !Number.isInteger(v as number)) {
      throw new Error('canonicalize: only finite integers are allowed');
    }
    return String(v);
  }
  if (Array.isArray(v)) return '[' + v.map(ser).join(',') + ']';
  if (t === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + ser(obj[k])).join(',') + '}';
  }
  throw new Error(`canonicalize: unsupported type ${t}`);
}
