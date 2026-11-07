import { NextResponse } from "next/server";
import { availableSources } from "../providers";

/**
 * GET /api/thumbnails/sources: the image-search sources this deployment
 * supports, and whether each is usable. The picker uses `enabled` to disable
 * Google when its credentials are not configured on the server.
 *
 * Returns { sources: { source, label, enabled }[] }.
 */
export async function GET() {
  return NextResponse.json({ sources: availableSources() });
}
