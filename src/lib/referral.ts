// "Help a friend" — privacy-preserving referral links + the device's own
// activity score.
//
// A referral is a random CODE the user shares (in a link). The relay is only
// ever told refId = base64url(SHA-256("foren-ref|" + code)); it never sees the
// code and never sees who created the link, so it CANNOT identify the
// originator. When a friend opens the link, their device redeems it with a
// signed proof of its anonymous identity; the relay stores only a per-recipient
// commitment, so it can count DISTINCT redeemers (how often a link was reused)
// without knowing who they are. The creator, who holds the code, can read those
// aggregate counts back.
//
// The activity score is computed on the relay from this device's anonymous usage
// and returned only to this device (with its percentile among all users).

import { getOrCreateIdentity } from '@/usage/identity';
import { SIGN_PARAMS, bytesToBase64Url } from '@/usage/identity';
import { canonicalize } from '@/usage/canonical';
import { secureGet, secureSet, secureRemove } from '@/lib/secureStore';

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://127.0.0.1:4000';
const APP_URL =
  import.meta.env.VITE_APP_URL ?? (typeof location !== 'undefined' ? location.origin : 'https://app.forenlabs.co.uk');

const K_CODE = 'foren.referral.code'; // this device's own shareable code (display form)
const K_REDEEMED = 'foren.referral.redeemed'; // '1' once we've redeemed an inbound link

// Crockford base32 (no I/L/O/U — unambiguous when read aloud or typed).
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

async function sha256Url(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input) as BufferSource);
  return bytesToBase64Url(new Uint8Array(d));
}

/** A fresh 80-bit referral code, grouped for readability (e.g. ABCD-EFGH-JKMN-PQ). */
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10)); // 80 bits
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return (out.match(/.{1,4}/g) ?? [out]).join('-');
}

/** Normalise so dashes/case never affect the derived id. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function refIdFor(normCode: string): Promise<string> {
  return sha256Url(`foren-ref|${normCode}`);
}

/** Sign a request that proves control of this device's anonymous identity. */
async function signEnvelope(extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const id = await getOrCreateIdentity();
  const payload: Record<string, unknown> = {
    v: 1,
    anonId: id.anonId,
    pubKey: id.pubKeyB64,
    nonce: bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    issuedAt: Date.now(),
    ...extra,
  };
  const sig = await crypto.subtle.sign(
    SIGN_PARAMS,
    id.privKey,
    new TextEncoder().encode(canonicalize(payload)) as BufferSource,
  );
  return { ...payload, signature: bytesToBase64Url(new Uint8Array(sig)) };
}

// ── public API ───────────────────────────────────────────────────────────────

export interface MyReferral {
  code: string; // display form (with dashes)
  link: string; // full shareable URL
}

/** This device's referral link, minting + persisting a code on first use. */
export async function getMyReferralLink(): Promise<MyReferral> {
  let code = await secureGet(K_CODE);
  if (!code) {
    code = generateCode();
    await secureSet(K_CODE, code);
  }
  return { code, link: `${APP_URL}/?ref=${encodeURIComponent(code)}` };
}

export interface ReferralStats {
  helped: number; // distinct people who used your link
  redemptions: number; // total redemptions (incl. reuse)
  reused: boolean; // more than one person used it
  lastAt: number | null; // last redemption (epoch ms)
}

/** Read the aggregate reuse stats for this device's link (zeros if never used). */
export async function getReferralStats(): Promise<ReferralStats> {
  const code = await secureGet(K_CODE);
  if (!code) return { helped: 0, redemptions: 0, reused: false, lastAt: null };
  const refId = await refIdFor(normalizeCode(code));
  const res = await fetch(`${RELAY_URL}/v1/referral/${refId}`);
  if (res.status === 404) return { helped: 0, redemptions: 0, reused: false, lastAt: null };
  if (!res.ok) throw new Error(`referral stats failed (${res.status})`);
  const b = (await res.json()) as {
    redemptions: number;
    distinctRedeemers: number;
    reused: boolean;
    lastRedeemedAt: number | null;
  };
  return {
    helped: b.distinctRedeemers,
    redemptions: b.redemptions,
    reused: b.reused,
    lastAt: b.lastRedeemedAt,
  };
}

export interface ActivityScore {
  score: number; // 0..100
  percentile: number; // 0..1, share of users you're as/more active than
  totalActions: number;
  activeWeeks: number;
  population: number;
}

/** This device's own activity score, computed on the relay. */
export async function getActivityScore(): Promise<ActivityScore | null> {
  try {
    const res = await fetch(`${RELAY_URL}/v1/activity/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await signEnvelope()),
    });
    if (!res.ok) return null;
    return (await res.json()) as ActivityScore;
  } catch {
    return null;
  }
}

/**
 * If the app was opened from a referral link (?ref=CODE), redeem it once. No-op
 * if there's no code, we've already redeemed one, or the link is our own. Always
 * strips the code from the address bar afterwards. Best-effort; never throws.
 */
export async function maybeRedeemInboundReferral(): Promise<void> {
  if (typeof location === 'undefined') return;
  try {
    const params = new URLSearchParams(location.search);
    const raw = params.get('ref');
    if (!raw) return;

    // Remove it from the URL immediately so it never lingers or double-redeems.
    params.delete('ref');
    const clean = location.pathname + (params.toString() ? `?${params}` : '') + location.hash;
    history.replaceState(null, '', clean);

    if (await secureGet(K_REDEEMED)) return; // one inbound redemption per device
    const norm = normalizeCode(raw);
    if (norm.length < 8) return;

    // Never redeem your own link.
    const mine = await secureGet(K_CODE);
    if (mine && normalizeCode(mine) === norm) return;

    const refId = await refIdFor(norm);
    const res = await fetch(`${RELAY_URL}/v1/referral/redeem`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(await signEnvelope({ refId })),
    });
    if (res.ok) await secureSet(K_REDEEMED, '1');
  } catch {
    /* referral is optional — never block the app */
  }
}

/** Forget this device's referral code (used by the full reset path). */
export async function clearReferral(): Promise<void> {
  await secureRemove(K_CODE);
  await secureRemove(K_REDEEMED);
}
