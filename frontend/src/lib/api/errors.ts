import { z } from "zod";
import type { ApiErrorDetail } from "@/types/domain";

/** Codes the client raises itself when no usable API response exists. */
export const CLIENT_ERROR_CODES = {
  network: "NETWORK_ERROR",
  timeout: "REQUEST_TIMEOUT",
  unexpected: "UNEXPECTED_RESPONSE",
} as const;

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().nullish(),
    details: z
      .array(z.object({ field: z.string(), issue: z.string() }))
      .nullish(),
  }),
});

/**
 * Application-level error for every failed API call. Mirrors the error
 * envelope in API-CONTRACT.md: branch on `code`, show `message`, and map
 * `details[].field` onto form fields.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly details: ApiErrorDetail[];

  constructor(init: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    details?: ApiErrorDetail[];
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.details = init.details ?? [];
  }

  /** The `issue` for a field, when the API reported one. */
  issueFor(field: string): string | undefined {
    return this.details.find((d) => d.field === field)?.issue;
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** Build an ApiError from a non-2xx response body of unknown shape. */
export function apiErrorFromBody(
  status: number,
  body: unknown,
  headerRequestId: string | null,
): ApiError {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, requestId, details } = parsed.data.error;
    return new ApiError({
      status,
      code,
      message,
      requestId: requestId ?? headerRequestId,
      details: details ?? [],
    });
  }
  return new ApiError({
    status,
    code: CLIENT_ERROR_CODES.unexpected,
    message: "Something went wrong on our side. Please try again.",
    requestId: headerRequestId,
  });
}

export function networkError(): ApiError {
  return new ApiError({
    status: 0,
    code: CLIENT_ERROR_CODES.network,
    message: "We couldn't reach the server. Check your connection and try again.",
  });
}

export function timeoutError(): ApiError {
  return new ApiError({
    status: 0,
    code: CLIENT_ERROR_CODES.timeout,
    message: "The request took too long. Please try again.",
  });
}

/** True for a user-initiated abort (AbortController), which is not a failure. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** A message that is always safe to show; never a blank string. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.message) return error.message;
  return fallback;
}
