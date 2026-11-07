import { NextResponse, type NextRequest } from "next/server";

/**
 * GET /api/thumbnails/fetch?url=...: download one image chosen from the search
 * results and stream it back to the browser. This runs server-side because the
 * source images live on third-party hosts that do not send CORS headers, so the
 * browser cannot fetch them directly for use as an upload File.
 *
 * Only http(s) image responses within the thumbnail size cap are returned; the
 * client still re-validates the bytes with checkThumbnailFile before use.
 */

const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ message: "Missing image URL." }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ message: "That image URL is invalid." }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ message: "That image URL is invalid." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { headers: { Accept: "image/*" } });
  } catch {
    return NextResponse.json(
      { message: "Couldn't download that image. Pick another one." },
      { status: 502 },
    );
  }

  const contentType = (upstream.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!upstream.ok || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    return NextResponse.json(
      { message: "That image can't be used. Pick another one." },
      { status: 422 },
    );
  }

  const declaredLength = Number(upstream.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
    return NextResponse.json(
      { message: "That image is larger than 5 MB. Pick a smaller one." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { message: "That image is larger than 5 MB. Pick a smaller one." },
      { status: 413 },
    );
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
