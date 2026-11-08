import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { SERVER_API_BASE_URL } from "@/lib/api/config";
import { apiErrorFromBody } from "@/lib/api/errors";
import { authResponseSchema } from "@/lib/api/schemas";
import type { ApiErrorEnvelope, AuthSession } from "@/types/domain";
import {
  AUTH_BASE_PATH,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  SESSION_HINT_COOKIE,
} from "./constants";

/**
 * Server-side helpers for the auth route handlers in src/app/api/auth.
 *
 * The browser talks to these handlers; the handlers talk to the Spring Boot
 * API. The API's refresh token is stored in an HttpOnly cookie and is never
 * included in a response body, so page scripts cannot read it (XSS-safe).
 */

const UPSTREAM_TIMEOUT_MS = 15_000;
const isProduction = process.env.NODE_ENV === "production";

const noStore = { "Cache-Control": "no-store" };

function envelope(
  status: number,
  code: string,
  message: string,
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    { error: { code, message, requestId: "", details: [] } },
    { status, headers: noStore },
  );
}

/**
 * Reject requests a browser marks as cross-site. Together with the
 * SameSite=Strict refresh cookie this blocks CSRF on cookie-authenticated
 * calls. Non-browser clients send no Sec-Fetch-Site header and pass.
 */
export function rejectCrossSite(request: NextRequest): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return envelope(403, "FORBIDDEN", "Cross-site requests are not allowed.");
  }
  return null;
}

/** Validate a JSON request body; returns the parsed value or a 400 response. */
export async function parseBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
): Promise<z.infer<S> | NextResponse> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return envelope(400, "MALFORMED_REQUEST", "Request body is not valid.");
  }
  return parsed.data;
}

async function callUpstream(
  path: string,
  body: unknown,
  requestId: string | null,
): Promise<Response | null> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (requestId && /^[A-Za-z0-9._-]{8,64}$/.test(requestId)) {
    headers["X-Request-ID"] = requestId;
  }
  try {
    return await fetch(`${SERVER_API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

function upstreamUnavailable(): NextResponse<ApiErrorEnvelope> {
  return envelope(
    502,
    "UPSTREAM_UNAVAILABLE",
    "We couldn't reach the server. Check your connection and try again.",
  );
}

/** Forward an upstream error (status and envelope) to the browser. */
async function passThroughError(upstream: Response): Promise<NextResponse> {
  const body: unknown = await upstream.json().catch(() => null);
  const error = apiErrorFromBody(
    upstream.status,
    body,
    upstream.headers.get("X-Request-ID"),
  );
  return NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        requestId: error.requestId ?? "",
        details: error.details,
      },
    } satisfies ApiErrorEnvelope,
    { status: upstream.status, headers: noStore },
  );
}

function setAuthCookies(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: AUTH_BASE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
  response.cookies.set(SESSION_HINT_COOKIE, "1", {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
    path: AUTH_BASE_PATH,
    maxAge: 0,
  });
  response.cookies.set(SESSION_HINT_COOKIE, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 0,
  });
}

/**
 * POST to an API endpoint that returns an AuthResponse (register, login,
 * refresh). On success the refresh token moves into cookies and the browser
 * receives the session without it.
 */
export async function authenticate(
  request: NextRequest,
  upstreamPath: string,
  body: unknown,
): Promise<NextResponse> {
  const upstream = await callUpstream(
    upstreamPath,
    body,
    request.headers.get("x-request-id"),
  );
  if (!upstream) return upstreamUnavailable();

  if (!upstream.ok) {
    const response = await passThroughError(upstream);
    // An invalid refresh token ends the session: drop both cookies.
    if (upstreamPath === "/auth/refresh" && upstream.status === 401) {
      clearAuthCookies(response);
    }
    return response;
  }

  const parsed = authResponseSchema.safeParse(
    await upstream.json().catch(() => null),
  );
  if (!parsed.success) {
    return envelope(
      502,
      "UNEXPECTED_RESPONSE",
      "Something went wrong on our side. Please try again.",
    );
  }

  const { refreshToken, ...session } = parsed.data;
  const response = NextResponse.json(session satisfies AuthSession, {
    status: upstream.status,
    headers: noStore,
  });
  setAuthCookies(response, refreshToken);
  return response;
}

/** The refresh token from the HttpOnly cookie, if present. */
export function readRefreshToken(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_COOKIE)?.value ?? null;
}

/** The documented answer when there is no refresh cookie to exchange. */
export function noSession(): NextResponse {
  const response = envelope(
    401,
    "INVALID_REFRESH_TOKEN",
    "Your session has expired. Log in again.",
  );
  clearAuthCookies(response);
  return response;
}

/** Best-effort POST /auth/logout; the API ignores it today but may revoke later. */
export async function notifyLogout(
  request: NextRequest,
  refreshToken: string | null,
): Promise<void> {
  await callUpstream(
    "/auth/logout",
    refreshToken ? { refreshToken } : {},
    request.headers.get("x-request-id"),
  );
}
