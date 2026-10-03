const key = "rideledger.pendingInvite";
const lifetime = 7 * 24 * 60 * 60 * 1000;
export function rememberInvite(token: string): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ token, until: Date.now() + lifetime }));
  } catch {
    /* The original link remains usable. */
  }
}
export function recalledInvite(): string | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (value && /^[0-9a-f]{64}$/.test(value.token) && value.until > Date.now())
      return value.token;
    sessionStorage.removeItem(key);
  } catch {
    /* Missing/blocked temporary storage must never grant access. */
  }
  return null;
}
export function forgetInvite(): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* No persistent fallback. */
  }
}
