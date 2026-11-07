import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, parseBody, rejectCrossSite } from "@/lib/auth/bff";

const registerBody = z.object({
  email: z.string(),
  username: z.string(),
  displayName: z.string(),
  password: z.string(),
});

/** POST /api/auth/register: API register (logs the user in); refresh token goes to an HttpOnly cookie. */
export async function POST(request: NextRequest) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const body = await parseBody(request, registerBody);
  if (body instanceof NextResponse) return body;

  return authenticate(request, "/auth/register", body);
}
