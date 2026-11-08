import { ZodError } from "zod";
import { AUTH_BASE_PATH } from "@/lib/auth/constants";
import {
  clearSession,
  getValidAccessToken,
  setSession,
} from "@/lib/auth/session-store";
import {
  ApiError,
  CLIENT_ERROR_CODES,
  apiErrorFromBody,
  isAbortError,
  networkError,
  timeoutError,
} from "./errors";
import { BROWSER_API_BASE_URL, SERVER_API_BASE_URL } from "./config";
import { authSessionSchema } from "./schemas";

/**
 * Transport for the AI Drama API: base URL, auth header, the
 * 401 -> refresh once -> retry flow, and error-envelope parsing.
 *
 * Endpoint functions live in client.ts; nothing else calls `fetch` for the API.
 */

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * none:     never send a token (login, register, public lists).
 * optional: send a valid token if the browser has one (owner can open a draft).
 * required: a token is needed; refresh first if it is missing or expired.
 */
export type AuthMode = "none" | "optional" | "required";

export interface RequestOptions {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: AuthMode;
  signal?: AbortSignal;
  /** Override the API base; used for the same-origin auth route handlers. */
  baseUrl?: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function buildUrl(opts: RequestOptions): string {
  // Browser calls go same-origin through the /api/v1 proxy; server rendering
  // calls Spring Boot directly and needs an absolute URL.
  const base =
    opts.baseUrl ?? (isBrowser() ? BROWSER_API_BASE_URL : SERVER_API_BASE_URL);
  if (!isBrowser() && !/^https?:\/\//.test(base)) {
    throw new Error(
      "The server API base URL must be absolute (set API_INTERNAL_BASE_URL or NEXT_PUBLIC_API_BASE_URL).",
    );
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return `${base}${opts.path}${qs ? `?${qs}` : ""}`;
}

async function send(
  opts: RequestOptions,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...opts.headers,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  // Correlation id for support. Browser only: random ids during server
  // prerendering are rejected by Cache Components, and the API generates one.
  if (isBrowser()) headers["X-Request-ID"] = crypto.randomUUID();

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = opts.signal
    ? AbortSignal.any([opts.signal, timeout])
    : timeout;

  try {
    return await fetch(buildUrl(opts), {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw timeoutError();
    }
    if (isAbortError(error)) throw error;
    throw networkError();
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body (for example a gateway page): fall back to a generic error.
  }
  return apiErrorFromBody(res.status, body, res.headers.get("X-Request-ID"));
}

function sessionExpiredError(): ApiError {
  return new ApiError({
    status: 401,
    code: "UNAUTHENTICATED",
    message: "Your session has expired. Log in again.",
  });
}

function unexpectedResponse(status: number): ApiError {
  return new ApiError({
    status,
    code: CLIENT_ERROR_CODES.unexpected,
    message: "Something went wrong on our side. Please try again.",
  });
}

/* -------------------------------------------------------------------------- */
/* Refresh                                                                     */
/* -------------------------------------------------------------------------- */

let refreshInFlight: Promise<string | null> | null = null;

async function runRefresh(): Promise<string | null> {
  try {
    const session = await requestJson(
      { baseUrl: AUTH_BASE_PATH, path: "/refresh", method: "POST" },
      (json) => authSessionSchema.parse(json),
    );
    setSession(session);
    return session.accessToken;
  } catch (error) {
    // Refresh 401 (INVALID_REFRESH_TOKEN, SESSION_EXPIRED): the session is over.
    if (error instanceof ApiError && error.status === 401) {
      clearSession();
      return null;
    }
    throw error;
  }
}

/**
 * Exchange the HttpOnly refresh cookie for a new access token. Concurrent
 * callers share one request: the API rotates the refresh token, so a second
 * parallel refresh would present an already-replaced token.
 * Resolves null (and clears the session) when the session has ended.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Send a request, applying the contract's auth flow: on 401 UNAUTHENTICATED
 * refresh once and retry once. Other 401 codes (INVALID_CREDENTIALS, ...) never
 * trigger a refresh. On the server there is no session, so requests are anonymous.
 */
async function execute(opts: RequestOptions): Promise<Response> {
  const mode = opts.auth ?? "none";

  if (!isBrowser() || mode === "none") {
    const res = await send(opts, null);
    if (!res.ok) throw await toApiError(res);
    return res;
  }

  let token = getValidAccessToken();
  if (!token && mode === "required") {
    token = await refreshAccessToken();
    if (!token) throw sessionExpiredError();
  }

  let res = await send(opts, token);
  if (res.status === 401 && token) {
    const failure = await toApiError(res);
    if (failure.code !== "UNAUTHENTICATED") throw failure;

    const fresh = await refreshAccessToken();
    if (!fresh && mode === "required") throw failure;
    // Optional auth with a dead session: retry once as an anonymous visitor.
    res = await send(opts, fresh);
  }

  if (!res.ok) throw await toApiError(res);
  return res;
}

/** Request a JSON body and validate or narrow it with `parse`. */
export async function requestJson<T>(
  opts: RequestOptions,
  parse: (json: unknown) => T,
): Promise<T> {
  const res = await execute(opts);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw unexpectedResponse(res.status);
  }
  try {
    return parse(json);
  } catch (error) {
    if (error instanceof ZodError) throw unexpectedResponse(res.status);
    throw error;
  }
}

/** Request an endpoint that returns no body (202, 204). */
export async function requestVoid(opts: RequestOptions): Promise<void> {
  const res = await execute(opts);
  await res.body?.cancel();
}

/**
 * The one place a catalogue response is narrowed to its domain type without a
 * runtime schema. API-CONTRACT.md is the source of truth for these shapes;
 * shapes the client acts on (auth, uploads, processing) use Zod in schemas.ts.
 */
export function asContract<T>(json: unknown): T {
  return json as T;
}
