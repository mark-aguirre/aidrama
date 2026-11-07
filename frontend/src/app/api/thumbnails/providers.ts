/**
 * Image-search providers for the upload thumbnail picker. Each provider takes a
 * query and returns a normalized list of results the picker understands:
 *
 *   { id, thumbnail, url, title, provider }
 *
 * where `thumbnail` is a small preview to render and `url` is the full-size
 * image to download when the user picks it. Providers run server-side only, so
 * no API keys reach the browser.
 *
 * Two sources are supported:
 *  - "openverse": free, no key, openly licensed images. Always available.
 *  - "google":    Google Custom Search JSON API (searchType=image). Available
 *                 only when GOOGLE_IMAGE_SEARCH_KEY and GOOGLE_IMAGE_SEARCH_CX
 *                 are set. Google has no free open image API; this is the only
 *                 sanctioned way to query Google Images programmatically.
 */

export type ThumbnailSource = "openverse" | "google";

export type ThumbnailSearchResult = {
  id: string;
  thumbnail: string;
  url: string;
  title: string;
  provider: string;
};

/** Raised by a provider when the upstream service fails; carries a user-facing message. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** File extensions the thumbnail accepts (mirrors schemas.ts). */
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

function extensionOf(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

const UPSTREAM_UNAVAILABLE =
  "Image search is unavailable right now. Try again in a moment.";

// --- Openverse ------------------------------------------------------------

const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";
/** Openverse returns 401 for anonymous requests above page_size 20. */
const OPENVERSE_PAGE_SIZE = 20;

type OpenverseImage = {
  id: string;
  title?: string;
  url: string;
  thumbnail?: string;
  filetype?: string;
  source?: string;
  provider?: string;
};

async function searchOpenverse(query: string): Promise<ThumbnailSearchResult[]> {
  const target = new URL(OPENVERSE_ENDPOINT);
  target.searchParams.set("q", query);
  target.searchParams.set("page_size", String(OPENVERSE_PAGE_SIZE));

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
  } catch {
    throw new ProviderError(UPSTREAM_UNAVAILABLE);
  }
  if (!upstream.ok) {
    throw new ProviderError(UPSTREAM_UNAVAILABLE);
  }

  const body = (await upstream.json()) as { results?: OpenverseImage[] };
  return (body.results ?? [])
    .filter((image) => {
      if (!image.url) return false;
      const filetype = image.filetype?.toLowerCase() ?? extensionOf(image.url);
      // Keep when the type is allowed, or unknown (the fetch route re-checks).
      return !filetype || ALLOWED_EXTENSIONS.has(filetype);
    })
    .map((image) => ({
      id: image.id,
      thumbnail: image.thumbnail || image.url,
      url: image.url,
      title: image.title?.trim() || query,
      provider: image.source || image.provider || "Openverse",
    }));
}

// --- Google Custom Search --------------------------------------------------

const GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
/** Google Custom Search allows at most 10 results per request. */
const GOOGLE_PAGE_SIZE = 10;

type GoogleItem = {
  link: string;
  title?: string;
  mime?: string;
  fileFormat?: string;
  displayLink?: string;
  image?: { thumbnailLink?: string; contextLink?: string };
};

/** Credentials for Google image search, or null when not configured. */
function googleCredentials(): { key: string; cx: string } | null {
  const key = process.env.GOOGLE_IMAGE_SEARCH_KEY?.trim();
  const cx = process.env.GOOGLE_IMAGE_SEARCH_CX?.trim();
  return key && cx ? { key, cx } : null;
}

async function searchGoogle(query: string): Promise<ThumbnailSearchResult[]> {
  const creds = googleCredentials();
  if (!creds) {
    throw new ProviderError(
      "Google image search isn't configured on this server.",
      503,
    );
  }

  const target = new URL(GOOGLE_ENDPOINT);
  target.searchParams.set("key", creds.key);
  target.searchParams.set("cx", creds.cx);
  target.searchParams.set("q", query);
  target.searchParams.set("searchType", "image");
  target.searchParams.set("num", String(GOOGLE_PAGE_SIZE));
  target.searchParams.set("safe", "active");
  // Ask for formats the thumbnail accepts.
  target.searchParams.set("fileType", "jpg,png,webp");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
  } catch {
    throw new ProviderError(UPSTREAM_UNAVAILABLE);
  }

  if (upstream.status === 429) {
    throw new ProviderError(
      "Google image search has hit its daily quota. Try Openverse instead.",
      429,
    );
  }
  if (!upstream.ok) {
    throw new ProviderError(UPSTREAM_UNAVAILABLE);
  }

  const body = (await upstream.json()) as { items?: GoogleItem[] };
  return (body.items ?? [])
    .filter((item) => {
      if (!item.link) return false;
      const ext =
        item.fileFormat?.toLowerCase().replace(/[^a-z0-9]/g, "") ??
        item.mime?.split("/")[1]?.toLowerCase() ??
        extensionOf(item.link);
      const normalized = ext === "jpeg" ? "jpg" : ext;
      return !normalized || ALLOWED_EXTENSIONS.has(normalized);
    })
    .map((item, index) => ({
      id: `google-${index}-${item.link}`,
      thumbnail: item.image?.thumbnailLink || item.link,
      url: item.link,
      title: item.title?.trim() || query,
      provider: item.displayLink || "Google",
    }));
}

// --- Dispatch --------------------------------------------------------------

/** Sources the client may pick, with whether each is usable in this deployment. */
export function availableSources(): { source: ThumbnailSource; label: string; enabled: boolean }[] {
  return [
    { source: "openverse", label: "Openverse", enabled: true },
    { source: "google", label: "Google Images", enabled: googleCredentials() !== null },
  ];
}

export function parseSource(raw: string | null): ThumbnailSource {
  return raw === "google" ? "google" : "openverse";
}

export function searchImages(
  source: ThumbnailSource,
  query: string,
): Promise<ThumbnailSearchResult[]> {
  return source === "google" ? searchGoogle(query) : searchOpenverse(query);
}
