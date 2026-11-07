import { NextResponse, type NextRequest } from "next/server";
import {
  ProviderError,
  parseSource,
  searchImages,
  type ThumbnailSearchResult,
} from "../providers";

/**
 * GET /api/thumbnails/search?q=...&source=openverse|google: image search for
 * the upload thumbnail picker. The `source` selects a provider (see
 * ../providers.ts); it defaults to Openverse. Providers run server-side so no
 * API keys reach the browser.
 *
 * Returns { results: { id, thumbnail, url, title, provider }[] }, where
 * `thumbnail` is a preview to render and `url` is the full-size image to
 * download when the user picks it.
 */

// Re-exported so the client can import the result type from one place.
export type { ThumbnailSearchResult };

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json(
      { message: "Enter something to search for." },
      { status: 400 },
    );
  }

  const source = parseSource(request.nextUrl.searchParams.get("source"));

  try {
    const results = await searchImages(source, query);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { message: "Image search is unavailable right now. Try again in a moment." },
      { status: 502 },
    );
  }
}
