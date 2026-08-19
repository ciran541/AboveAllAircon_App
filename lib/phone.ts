/**
 * lib/phone.ts
 *
 * Singapore phone normalisation, so the booking API can recognise a repeat
 * customer instead of creating a second row for them.
 *
 * The customers table holds phone numbers exactly as they were typed:
 * "97433005", " 97513566", "93233050 ", "8590 5930", and (once the assistant
 * starts sending them) "+6591234567". saveJob() has always INSERTed a new
 * customer for every new booking and customerService has no lookup at all, so
 * without a normaliser every returning customer becomes a duplicate.
 *
 * Pure functions, no I/O — the matching half of this logic also exists in SQL
 * inside the book_site_visit RPC (migration 20260819000000), which compares
 * the trailing digits of the stored number against `matchKey` below.
 */

/** Everything except digits. Keeps a leading + out of the comparison. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export interface NormalizedPhone {
  /** Digits as given, country code and all: "6591234567". */
  digits: string;
  /** The 8-digit local number when this is a Singapore number, else null. */
  local: string | null;
  /** E.164 for SG numbers ("+6591234567"), else "+" + digits. */
  e164: string;
  /**
   * What a lookup compares against: the local 8 digits for an SG number, or
   * the full digit string otherwise. Never shorter than 8, so a lookup can
   * refuse to match on something too short to identify anyone.
   */
  matchKey: string;
  /** SG mobile/landline shape — 8 digits starting 3, 6, 8 or 9. */
  isSingapore: boolean;
}

/**
 * Normalises "+65 9123 4567", "6591234567", "9123-4567" and "91234567" to the
 * same match key. Non-SG numbers are kept whole and matched on all digits, so
 * an overseas number can't collide with a local one by sharing 8 digits.
 */
export function normalizeSgPhone(raw: string | null | undefined): NormalizedPhone | null {
  const digits = digitsOnly(raw ?? "");
  if (!digits) return null;

  // 65 is both Singapore's country code and a legitimate start to nothing
  // else 8 digits long, so stripping it is only safe on a 10-digit number.
  let local: string | null = null;
  if (/^[3689]\d{7}$/.test(digits)) local = digits;
  else if (/^65[3689]\d{7}$/.test(digits)) local = digits.slice(2);

  const isSingapore = local !== null;
  return {
    digits,
    local,
    e164: isSingapore ? `+65${local}` : `+${digits}`,
    matchKey: local ?? digits,
    isSingapore,
  };
}

/** True when both numbers identify the same subscriber. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeSgPhone(a);
  const right = normalizeSgPhone(b);
  if (!left || !right) return false;
  return left.matchKey === right.matchKey;
}

/**
 * The lookup key, or null when the number is too short to be worth matching
 * on. Eight digits is the floor: matching on fewer would let a fragment in
 * the messy legacy data pull back the wrong customer.
 */
export function phoneMatchKey(raw: string | null | undefined): string | null {
  const normalized = normalizeSgPhone(raw);
  if (!normalized) return null;
  return normalized.matchKey.length >= 8 ? normalized.matchKey : null;
}

/** How a number is stored on new rows: local 8 digits for SG, else E.164. */
export function formatForStorage(raw: string | null | undefined): string | null {
  const normalized = normalizeSgPhone(raw);
  if (!normalized) return null;
  return normalized.local ?? normalized.e164;
}
