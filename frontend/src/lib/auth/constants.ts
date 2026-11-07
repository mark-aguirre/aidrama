/**
 * Shared names for the auth cookies set by the Next.js route handlers in
 * src/app/api/auth. Names only: no values or secrets live here.
 */

/** HttpOnly cookie holding the API refresh token. Never readable by scripts. */
export const REFRESH_COOKIE = "aidrama_rt";

/**
 * Non-sensitive hint ("1") that a refresh cookie probably exists, so the app
 * only calls /api/auth/refresh for visitors who might be signed in.
 */
export const SESSION_HINT_COOKIE = "aidrama_session";

/** Same-origin base path of the auth route handlers. */
export const AUTH_BASE_PATH = "/api/auth";

/** Refresh token lifetime (API-CONTRACT.md: 14 days). */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;
