import { NextResponse, type NextRequest } from "next/server";
import {
  clearAuthCookies,
  notifyLogout,
  readRefreshToken,
  rejectCrossSite,
} from "@/lib/auth/bff";

/** POST /api/auth/logout: clear both auth cookies; tell the API best-effort. */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  await notifyLogout(request, readRefreshToken(request));

  const response = new NextResponse(null, { status: 204 });
  clearAuthCookies(response);
  return response;
}
