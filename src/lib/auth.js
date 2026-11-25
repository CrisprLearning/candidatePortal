// Candidate session token, in the `crispriteUserToken` cookie (7-day expiry, path=/).
//
// On crisprlearning.com the cookie is set for the whole domain, so the portal
// (candidate.crisprlearning.com) and the secure checkout
// (securecheckout.crisprlearning.com) share one login: log in on either and
// the other is logged in as the same candidate; log out of either and both
// are logged out. secureCheckout/src/lib/auth.ts does the same: keep the two alike.
// Anywhere else (localhost) the cookie belongs to the host alone.
const TOKEN_COOKIE = 'crispriteUserToken';
const SHARED_DOMAIN = '.crisprlearning.com';
const DAYS = 7;

const onSharedDomain = () => window.location.hostname.endsWith(SHARED_DOMAIN.slice(1));

function scope(shared) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  return `; path=/; SameSite=Lax${secure}${shared ? `; domain=${SHARED_DOMAIN}` : ''}`;
}

function write(token, shared) {
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; expires=${expires}${scope(shared)}`;
}

function expire(shared) {
  document.cookie = `${TOKEN_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC${scope(shared)}`;
}

// Every value the browser holds under the name: one for this host alone and one for the domain can coexist.
function readAll() {
  return document.cookie.split('; ')
    .filter((part) => part.startsWith(`${TOKEN_COOKIE}=`))
    .map((part) => decodeURIComponent(part.slice(TOKEN_COOKIE.length + 1)))
    .filter(Boolean);
}

// Logins made before the cookie was shared belong to this host alone. Such a
// cookie is dropped: if a shared login exists it wins (it is the newer one),
// otherwise the old login is kept by re-saving it as the shared cookie.
function adoptSharedLogin() {
  if (!onSharedDomain()) return;
  const before = readAll();
  if (before.length === 0) return;
  expire(false);
  if (readAll().length === 0) write(before[0], true);
}
adoptSharedLogin();

export function getToken() {
  return readAll()[0] || '';
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function setToken(token) {
  if (!token) return;
  const shared = onSharedDomain();
  if (shared) expire(false);
  write(token, shared);
}

export function clearToken() {
  expire(false);
  if (onSharedDomain()) expire(true);
  try { window.sessionStorage.removeItem('cp_profile'); } catch { /* ignore */ } // see lib/profileCache.js
}
