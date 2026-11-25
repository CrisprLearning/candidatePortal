// Buying happens on the secure checkout site, outside this portal.
import { readCachedProfile } from './profileCache';

const CHECKOUT_CART_URL = 'https://securecheckout.crisprlearning.com/cart';

// A short fingerprint of the registered mobile number (FNV-1a, 8 hex digits).
// It only says "the same candidate or not"; the number itself never goes in the
// link. secureCheckout computes the same value in its src/lib/handoff.ts: keep the two alike.
export function candidateMark(mobile) {
  const digits = String(mobile ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return '';
  let hash = 0x811c9dc5;
  for (const ch of `crispr-candidate:${digits}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// The cart there, with the catalog item `code` (e.g. CR0006) added to it.
// "#u=<mark>" tells the checkout who is logged in here: if it still holds another
// candidate's login, it drops that login instead of showing the wrong person.
export function checkoutUrl(code) {
  const mark = candidateMark(readCachedProfile()?.registeredMobile);
  return `${CHECKOUT_CART_URL}?addItem=${encodeURIComponent(code)}${mark ? `#u=${mark}` : ''}`;
}
