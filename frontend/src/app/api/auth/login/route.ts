import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, parseBody, rejectCrossSite } from "@/lib/auth/bff";

const loginBody = z.object({ email: z.string(), password: z.string() });

/** POST /api/auth/login: API login; stores the refresh token in an HttpOnly cookie. */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const body = await parseBody(request, loginBody);
  if (body instanceof NextResponse) return body;

  return authenticate(request, "/auth/login", body);
}
