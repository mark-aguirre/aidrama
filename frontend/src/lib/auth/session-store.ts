import type { AuthSession, AuthUser } from "@/types/domain";

/**
 * In-memory session for the browser tab.
 *
 * The access token lives in this module variable only: never in localStorage,
 * sessionStorage, or a cookie. The refresh token is never visible to scripts
 * (HttpOnly cookie managed by src/app/api/auth). Because module state on the
 * server is shared across requests, every writer throws outside the browser.
 */

export type SessionStatus = "unknown" | "authenticated" | "anonymous";

export interface SessionSnapshot {
  status: SessionStatus;
  user: AuthUser | null;
}

/** Treat the token as expired slightly early to avoid sending a dying token. */
const EXPIRY_SKEW_MS = 10_000;

const UNKNOWN: SessionSnapshot = { status: "unknown", user: null };
const ANONYMOUS: SessionSnapshot = { status: "anonymous", user: null };

let accessToken: string | null = null;
let expiresAtMs = 0;
let snapshot: SessionSnapshot = UNKNOWN;
const listeners = new Set<() => void>();

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("The session store is browser-only.");
  }
}

function publish(next: SessionSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function setSession(session: AuthSession): void {
  assertBrowser();
  accessToken = session.accessToken;
  expiresAtMs = Date.now() + session.expiresIn * 1000;
  publish({ status: "authenticated", user: session.user });
}

export function clearSession(): void {
  assertBrowser();
  accessToken = null;
  expiresAtMs = 0;
  publish(ANONYMOUS);
}

/** The access token if present and not about to expire, otherwise null. */
export function getValidAccessToken(): string | null {
  if (typeof window === "undefined" || !accessToken) return null;
  return Date.now() < expiresAtMs - EXPIRY_SKEW_MS ? accessToken : null;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): SessionSnapshot {
  return snapshot;
}

export function getServerSnapshot(): SessionSnapshot {
  return UNKNOWN;
}
