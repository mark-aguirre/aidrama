import { refreshAccessToken } from "@/lib/api/http";
import type { AuthUser } from "@/types/domain";
import { SESSION_HINT_COOKIE } from "./constants";
import { clearSession, getSnapshot, getValidAccessToken } from "./session-store";

/** True when the non-sensitive hint cookie says a refresh cookie probably exists. */
function hasSessionHint(): boolean {
  return document.cookie
    .split("; ")
    .some((cookie) => cookie === `${SESSION_HINT_COOKIE}=1`);
}

/**
 * Bring the in-memory session up to date after a page load.
 *
 * Returns the signed-in user, or null for an anonymous visitor. Only calls the
 * refresh endpoint when the hint cookie is present, so anonymous visitors do
 * not generate failing requests. Browser-only.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  if (getValidAccessToken()) return getSnapshot().user;
  if (!hasSessionHint()) {
    clearSession();
    return null;
  }
  const token = await refreshAccessToken();
  return token ? getSnapshot().user : null;
}
