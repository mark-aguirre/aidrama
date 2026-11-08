import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { SERVER_API_BASE_URL } from "@/lib/api/config";
import type { ApiErrorEnvelope } from "@/types/domain";

/**
 * Same-origin proxy for the Spring Boot API.
 *
 * The browser calls /api/v1/* on this app's own origin; this handler forwards
 * the request to the real API server-to-server (SERVER_API_BASE_URL). Because
 * the browser never talks to the API host directly, there is no CORS and no
 * mixed content, and the API host stays an internal detail. The access token
 * rides in the Authorization header as before; this handler adds no
 * credentials of its own, so it is not an open credential proxy.
 */

const PREFIX = "/api/v1";
const UPSTREAM_TIMEOUT_MS = 30_000;

// Request headers worth forwarding upstream; everything else (host, cookies,
// connection headers) is dropped.
const FORWARD_REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "idempotency-key",
  "x-request-id",
];

const noStore = { "Cache-Control": "no-store" };

function upstreamUnavailable(): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    {
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message:
          "We couldn't reach the server. Check your connection and try again.",
        requestId: "",
        details: [],
      },
    },
    { status: 502, headers: noStore },
  );
}

async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  // "/api/v1/uploads/initiate" -> "/uploads/initiate"; SERVER_API_BASE_URL
  // already ends in "/api/v1".
  const rest = pathname.slice(PREFIX.length);
  const target = `${SERVER_API_BASE_URL}${rest}${search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return upstreamUnavailable();
  }

  const body = await upstream.arrayBuffer();
  const response = new NextResponse(body, { status: upstream.status });
  const contentType = upstream.headers.get("content-type");
  if (contentType) response.headers.set("content-type", contentType);
  const requestId = upstream.headers.get("x-request-id");
  if (requestId) response.headers.set("x-request-id", requestId);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
