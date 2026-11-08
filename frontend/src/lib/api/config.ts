
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Base URL the BROWSER uses for API calls. Same-origin "/api/v1" by default, so
 * every call goes through the Next.js proxy route handler at
 * app/api/v1/[...path]: the browser never talks to the API host directly, which
 * avoids CORS and mixed content entirely. Set NEXT_PUBLIC_API_BASE_URL only to
 * send the browser straight at an absolute API host (the old behaviour).
 */
export const BROWSER_API_BASE_URL =
  clean(process.env.NEXT_PUBLIC_API_BASE_URL) ?? "/api/v1";

/**
 * Base URL the Next.js SERVER uses to reach Spring Boot: the /api/v1 proxy and
 * /api/auth route handlers plus server-rendered pages, all server-to-server.
 * Must be absolute. Read at runtime from API_INTERNAL_BASE_URL and never exposed
 * to the browser (non-NEXT_PUBLIC vars are not inlined into the bundle).
 */
export const SERVER_API_BASE_URL =
  clean(process.env.API_INTERNAL_BASE_URL) ??
  clean(process.env.NEXT_PUBLIC_API_BASE_URL) ??
  "http://localhost:8080/api/v1";
