import { z } from "zod";
import { GENRES } from "@/lib/api/client";

/** Upload limits and formats from API-CONTRACT.md ("Enums": Upload formats). */
export const MAX_UPLOAD_BYTES = 2_147_483_648;

/** A thumbnail is a small poster image; the API caps it at 5 MB. */
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

const CONTENT_TYPE_BY_EXTENSION = new Map<string, string>([
  ["mp4", "video/mp4"],
  ["mov", "video/quicktime"],
  ["webm", "video/webm"],
]);

/** Image extensions the API accepts for a thumbnail, mapped to their content type. */
const IMAGE_CONTENT_TYPE_BY_EXTENSION = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

/** Value for the file input's `accept` attribute. */
export const ACCEPT_ATTRIBUTE =
  ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm";

/** Value for the thumbnail file input's `accept` attribute. */
export const THUMBNAIL_ACCEPT_ATTRIBUTE =
  ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export const UNSUPPORTED_FORMAT_MESSAGE =
  "Unsupported format. Use MP4, MOV, or WebM.";

export const UNSUPPORTED_THUMBNAIL_MESSAGE =
  "Unsupported image. Use JPG, PNG, or WebP.";

export type FileCheck =
  | { ok: true; contentType: string }
  | { ok: false; message: string };

/**
 * Check a picked file before any request is made. The API requires the file
 * extension to match the content type, so the content type is derived from the
 * extension and a conflicting browser-reported type is rejected.
 */
export function checkVideoFile(file: File): FileCheck {
  const extension = file.name.includes(".")
    ? (file.name.split(".").pop() ?? "").toLowerCase()
    : "";
  const contentType = CONTENT_TYPE_BY_EXTENSION.get(extension);
  if (!contentType || (file.type !== "" && file.type !== contentType)) {
    return { ok: false, message: UNSUPPORTED_FORMAT_MESSAGE };
  }
  if (file.size === 0) {
    return { ok: false, message: "This file is empty." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "This file is larger than 2 GB." };
  }
  return { ok: true, contentType };
}

/**
 * Check a picked thumbnail image before any request is made. Mirrors
 * `checkVideoFile`: the content type is derived from the extension so it always
 * matches what the API verifies, and a conflicting browser type is rejected.
 */
export function checkThumbnailFile(file: File): FileCheck {
  const extension = file.name.includes(".")
    ? (file.name.split(".").pop() ?? "").toLowerCase()
    : "";
  const contentType = IMAGE_CONTENT_TYPE_BY_EXTENSION.get(extension);
  if (!contentType || (file.type !== "" && file.type !== contentType)) {
    return { ok: false, message: UNSUPPORTED_THUMBNAIL_MESSAGE };
  }
  if (file.size === 0) {
    return { ok: false, message: "This image is empty." };
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    return { ok: false, message: "This image is larger than 5 MB." };
  }
  return { ok: true, contentType };
}

/** A suggested title taken from the file name. */
export function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 200);
}

const MAX_TITLE_LENGTH = 200;
const TRAILER_TITLE_SUFFIX = ": Trailer";

/** Title for the trailer video, derived from the main title and kept within the API's 200-character limit. */
export function trailerTitleFor(title: string): string {
  return `${title.trim().slice(0, MAX_TITLE_LENGTH - TRAILER_TITLE_SUFFIX.length)}${TRAILER_TITLE_SUFFIX}`;
}

/** `EPISODE` cannot be created yet (422 EPISODE_NOT_SUPPORTED). */
export const CREATABLE_TYPES = [
  { value: "MOVIE", label: "Movie" },
  { value: "SHORT", label: "Short" },
  { value: "TRAILER", label: "Trailer" },
  { value: "TEASER", label: "Teaser" },
] as const;

export const detailsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required.")
    .max(200, "Title must be 200 characters or fewer."),
  type: z.enum(["MOVIE", "SHORT", "TRAILER", "TEASER"], {
    error: "Select a content type.",
  }),
  isAiGenerated: z.boolean(),
  thumbnail: z
    .instanceof(File, { error: "A thumbnail image is required." })
    .refine((file) => checkThumbnailFile(file).ok, {
      error: UNSUPPORTED_THUMBNAIL_MESSAGE,
    }),
});

export type UploadDetails = z.infer<typeof detailsSchema>;

export const VISIBILITY_CHOICES = [
  { value: "PUBLIC", label: "Public" },
  { value: "UNLISTED", label: "Unlisted (only people with the link)" },
] as const;

export const publishSchema = z.object({
  genre: z.enum(GENRES, { error: "Select a genre." }),
  visibility: z.enum(["PUBLIC", "UNLISTED"], {
    error: "Select who can watch it.",
  }),
});

export type PublishValues = z.infer<typeof publishSchema>;
