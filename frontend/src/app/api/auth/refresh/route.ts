import type { NextRequest } from "next/server";
import {
  authenticate,
  noSession,
  readRefreshToken,
  rejectCrossSite,
} from "@/lib/auth/bff";

/** POST /api/auth/refresh: exchange the HttpOnly refresh cookie for a new session. */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const refreshToken = readRefreshToken(request);
  if (!refreshToken) return noSession();

  return authenticate(request, "/auth/refresh", { refreshToken });
}
