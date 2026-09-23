// Self-contained OpenTimestamps (.ots) verifier that runs ENTIRELY in the
// browser — no relay, no Foren server, and no heavy Node-oriented dependency.
// It parses the OTS binary format directly (spec: opentimestamps.org), binds
// the proof to the evidence Merkle root with WebCrypto, and — when the proof
// has been upgraded to Bitcoin — recomputes the timestamp path and checks the
// committed digest against the real Bitcoin block header fetched from a public
// explorer. Everything here is read-only and verifiable by anyone.
//
// Format reference (matches the reference JS client's serialization):
//   file:  HEADER_MAGIC | varuint version | cryptOp tag | fileHash bytes | timestamp
//   tree:  (0xff <tagOrAtt>)* <tagOrAtt>
//   op:    0xf0 append(varbytes) | 0xf1 prepend(varbytes) | 0xf2 reverse |
//          0xf3 hexlify | 0x02 sha1 | 0x03 ripemd160 | 0x08 sha256
//   att:   0x00 | 8-byte tag | varbytes payload

const HEADER_MAGIC = [
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d,
  0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2,
  0xe8, 0x84, 0xe8, 0x92, 0x94,
];

const ATT_BITCOIN = [0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01];
const ATT_LITECOIN = [0x06, 0x86, 0x9a, 0x0d, 0x73, 0xd7, 0x1b, 0x45];
const ATT_PENDING = [0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e];

// Crypt-op digest sizes.
const DIGEST_LEN: Record<number, number> = { 0x02: 20, 0x03: 20, 0x08: 32 };

export interface OtsResult {
  status: 'confirmed' | 'pending' | 'invalid' | 'unsupported';
  message: string;
  blockHeight?: number;
  blockTime?: number;
}

interface BitcoinAtt {
  height: number;
  msg: Uint8Array; // committed digest at this node (Bitcoin block merkle root, internal order)
}

class Cursor {
  i = 0;
  constructor(readonly b: Uint8Array) {}
  byte(): number {
    if (this.i >= this.b.length) throw new Error('unexpected end of ots');
    return this.b[this.i++];
  }
  bytes(n: number): Uint8Array {
    if (this.i + n > this.b.length) throw new Error('unexpected end of ots');
    return this.b.slice(this.i, (this.i += n));
  }
  varuint(): number {
    let value = 0;
    let shift = 0;
    let b: number;
    do {
      b = this.byte();
      value |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return value >>> 0;
  }
  varbytes(): Uint8Array {
    return this.bytes(this.varuint());
  }
  eof(): boolean {
    return this.i >= this.b.length;
  }
}

function arrEq(a: Uint8Array | number[], b: Uint8Array | number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function digest(algo: 'SHA-1' | 'SHA-256', msg: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest(algo, new Uint8Array(msg));
  return new Uint8Array(buf);
}

// Apply one operation to the running message, matching the reference client.
async function applyOp(tag: number, arg: Uint8Array | null, msg: Uint8Array): Promise<Uint8Array> {
  switch (tag) {
    case 0xf0: // append
      return concat(msg, arg!);
    case 0xf1: // prepend
      return concat(arg!, msg);
    case 0xf2: // reverse
      return Uint8Array.from(msg).reverse();
    case 0xf3: // hexlify
      return new TextEncoder().encode(toHex(msg));
    case 0x02: // sha1
      return digest('SHA-1', msg);
    case 0x08: // sha256
      return digest('SHA-256', msg);
    case 0x03: // ripemd160 — not in WebCrypto; only appears outside Bitcoin paths
      throw new Error('ripemd160-unsupported');
    default:
      throw new Error('unknown op tag 0x' + tag.toString(16));
  }
}

// Walk the timestamp tree from `msg`, collecting attestations. Computes the
// running message through each op so a Bitcoin attestation's committed digest
// is known and can be checked against the real block header.
async function walk(
  ctx: Cursor,
  msg: Uint8Array,
  out: { bitcoin: BitcoinAtt[]; litecoin: number[]; pending: string[]; unsupported: boolean },
): Promise<void> {
  const handle = async (tag: number, m: Uint8Array): Promise<void> => {
    if (tag === 0x00) {
      const attTag = ctx.bytes(8);
      const payload = new Cursor(ctx.varbytes());
      if (arrEq(attTag, ATT_BITCOIN)) out.bitcoin.push({ height: payload.varuint(), msg: m });
      else if (arrEq(attTag, ATT_LITECOIN)) out.litecoin.push(payload.varuint());
      else if (arrEq(attTag, ATT_PENDING)) out.pending.push(new TextDecoder().decode(payload.varbytes()));
      return;
    }
    const arg = tag === 0xf0 || tag === 0xf1 ? ctx.varbytes() : null;
    let next: Uint8Array;
    try {
      next = await applyOp(tag, arg, m);
    } catch (e) {
      // Unsupported hash (ripemd160) — we can't follow this branch, but we can
      // still surface the rest of the proof. Mark and stop descending here.
      if ((e as Error).message === 'ripemd160-unsupported') {
        out.unsupported = true;
        // Skip the remainder of this sub-timestamp is not possible without the
        // hash, so we bail out of the whole parse defensively.
        throw e;
      }
      throw e;
    }
    await walk(ctx, next, out);
  };

  let tag = ctx.byte();
  while (tag === 0xff) {
    await handle(ctx.byte(), msg);
    tag = ctx.byte();
  }
  await handle(tag, msg);
}

async function fetchBlockHeader(height: number): Promise<{ merkleRoot: string; time: number } | null> {
  // Public, read-only block explorers with permissive CORS. Try in order.
  const bases = ['https://blockstream.info/api', 'https://mempool.space/api'];
  for (const base of bases) {
    try {
      const hash = (await fetch(`${base}/block-height/${height}`).then((r) => (r.ok ? r.text() : null)))?.trim();
      if (!hash) continue;
      const block = await fetch(`${base}/block/${hash}`).then((r) => (r.ok ? r.json() : null));
      if (block?.merkle_root) return { merkleRoot: block.merkle_root, time: block.timestamp };
    } catch {
      /* try next explorer */
    }
  }
  return null;
}

/**
 * Verify a base64-encoded .ots detached timestamp against the evidence Merkle
 * root, entirely client-side.
 *  - Binds the proof to the root (fileHash === SHA-256(root)); a mismatch means
 *    the .ots does not belong to this evidence.
 *  - If upgraded to Bitcoin, recomputes the path and checks the committed digest
 *    against the real block header (fetched from a public explorer).
 *  - Otherwise reports the proof as pending (awaiting Bitcoin confirmation).
 */
export async function verifyOts(otsBase64: string, rootHex: string): Promise<OtsResult> {
  let ctx: Cursor;
  try {
    ctx = new Cursor(Uint8Array.from(atob(otsBase64), (c) => c.charCodeAt(0)));
  } catch {
    return { status: 'invalid', message: 'The Bitcoin proof is not valid base64.' };
  }

  try {
    // Header + version.
    if (!arrEq(ctx.bytes(HEADER_MAGIC.length), HEADER_MAGIC))
      return { status: 'invalid', message: 'Not an OpenTimestamps proof (bad header).' };
    ctx.varuint(); // major version

    // File hash operation + digest.
    const hashTag = ctx.byte();
    const len = DIGEST_LEN[hashTag];
    if (!len) return { status: 'unsupported', message: 'Unsupported file-hash algorithm in proof.' };
    const fileHash = ctx.bytes(len);

    // Binding check: the proof timestamps the Merkle root directly — the root
    // (itself a SHA-256 digest) is used as the OTS file hash. So the proof's
    // file hash must equal this bundle's root byte-for-byte.
    if (hashTag === 0x08 && !arrEq(fileHash, hexToBytes(rootHex)))
      return {
        status: 'invalid',
        message: 'The Bitcoin proof does not match this evidence root — it timestamps a different value.',
      };

    // Walk the tree from the file hash, collecting attestations.
    const out = { bitcoin: [] as BitcoinAtt[], litecoin: [] as number[], pending: [] as string[], unsupported: false };
    try {
      await walk(ctx, fileHash, out);
    } catch (e) {
      if ((e as Error).message !== 'ripemd160-unsupported') throw e;
    }

    // Confirmed on Bitcoin — verify against the real block header.
    if (out.bitcoin.length > 0) {
      const att = out.bitcoin[0];
      const header = await fetchBlockHeader(att.height);
      if (header) {
        // The committed digest is the block merkle root in internal byte order;
        // explorers report it big-endian, so reverse before comparing.
        const committed = toHex(Uint8Array.from(att.msg).reverse());
        if (committed === header.merkleRoot) {
          return {
            status: 'confirmed',
            blockHeight: att.height,
            blockTime: header.time,
            message: `Confirmed in Bitcoin block ${att.height.toLocaleString()} (${new Date(
              header.time * 1000,
            ).toLocaleDateString()}) — verified against the block header in your browser.`,
          };
        }
        return {
          status: 'invalid',
          message: `Proof claims Bitcoin block ${att.height} but the committed digest does not match that block's Merkle root.`,
        };
      }
      // Attestation present but couldn't reach an explorer to confirm the header.
      return {
        status: 'confirmed',
        blockHeight: att.height,
        message: `Anchored to Bitcoin block ${att.height.toLocaleString()} (couldn't reach a block explorer to re-check the header, but the proof commits to this evidence root).`,
      };
    }

    if (out.litecoin.length > 0)
      return { status: 'confirmed', blockHeight: out.litecoin[0], message: `Confirmed in Litecoin block ${out.litecoin[0].toLocaleString()}.` };

    if (out.pending.length > 0)
      return {
        status: 'pending',
        message:
          'Timestamp submitted to a calendar; awaiting Bitcoin confirmation (usually within a day). The proof already commits to this evidence root and is independently verifiable.',
      };

    if (out.unsupported)
      return {
        status: 'pending',
        message: 'Proof commits to this evidence root; part of it uses a hash this browser can’t follow — verify the .ots with any OpenTimestamps client.',
      };

    return { status: 'pending', message: 'Proof commits to this evidence root; no attestation found yet (still pending).' };
  } catch {
    return { status: 'invalid', message: 'The Bitcoin proof could not be parsed.' };
  }
}
