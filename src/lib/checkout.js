// Buying happens on the secure checkout site, outside this portal.
export const CHECKOUT_CART_URL = 'https://securecheckout.crisprlearning.com/cart';

// The cart there, with the catalog item `code` (e.g. CR0006) added to it.
export function checkoutUrl(code) {
  return `${CHECKOUT_CART_URL}?addItem=${encodeURIComponent(code)}`;
}
