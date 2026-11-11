/**
 * Display helpers for titles on the phone home screen. Real titles can be
 * long and all caps, so type steps down with length and the card clamps lines.
 */

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The tagline when it adds something. The API derives the featured tagline
 * from the description, so it can equal the title (or be blank); printing it
 * would repeat the title, so those cases return null.
 */
export function distinctTagline(
  title: string,
  tagline: string | null | undefined,
): string | null {
  const text = tagline?.replace(/\s+/g, " ").trim() ?? "";
  if (!text || normalize(text) === normalize(title)) return null;
  return text;
}

/** Hero title size: steps down as the title grows so it stays within three lines. */
export function heroTitleSize(title: string): string {
  const length = title.trim().length;
  if (length <= 18) return "text-4xl";
  if (length <= 36) return "text-3xl";
  if (length <= 64) return "text-2xl";
  return "text-xl";
}

/** Poster-card title size for the narrow 3:4 frame. */
export function posterTitleSize(title: string): string {
  const length = title.trim().length;
  if (length <= 14) return "text-lg";
  if (length <= 32) return "text-base";
  return "text-sm";
}

/** "Featured Science Fiction" -> "Featured science fiction", matching sentence-case UI copy. */
export function sentenceCase(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
