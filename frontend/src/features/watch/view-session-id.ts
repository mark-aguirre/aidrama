/**
 * Anonymous viewer id sent with view events. It is a random value with no link
 * to a person, not a credential, so it may live in localStorage and survive
 * reloads. The API ignores it for signed-in viewers. Browser only.
 */

const STORAGE_KEY = "aidrama.viewSessionId";

/** The API accepts 16..64 characters of [A-Za-z0-9_-]. */
const VALID_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** Fallback when storage is blocked, so one page load still reuses a single id. */
let memoryId: string | null = null;

function readStoredId(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored !== null && VALID_ID.test(stored) ? stored : null;
  } catch {
    // Storage can throw when blocked (private mode, policy); use the in-memory id.
    return null;
  }
}

function storeId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Not persisted; the in-memory id still covers this page load.
  }
}

/** The stored id, created with crypto.randomUUID() on first use. */
export function getViewSessionId(): string {
  if (memoryId) return memoryId;
  const stored = readStoredId();
  const id = stored ?? crypto.randomUUID();
  if (stored === null) storeId(id);
  memoryId = id;
  return id;
}
