import { MAX_THUMBNAIL_BYTES, checkThumbnailFile } from "./schemas";

/**
 * Shrinks a picked thumbnail in the browser before it is uploaded.
 *
 * This has to happen before `initiateUpload`: the session declares
 * `sizeBytes`, the presigned PUT is signed with that length, and `complete`
 * fails verification when the stored object's size or content type does not
 * match. So the smaller file must exist before a session is created, not during
 * the transfer.
 *
 * Every failure path returns the original file, so compression can only make an
 * upload smaller, never make it fail. The returned file is also re-checked with
 * `checkThumbnailFile`, so the form can never reject what this produces.
 */

/** Longest edge kept in the stored thumbnail: 1280x720 fills the largest place a poster is shown. */
const MAX_EDGE = 1280;

/** Encoder quality for the compressed copy. 0.8 stays visually clean for poster art. */
const QUALITY = 0.8;

/**
 * An image already within MAX_EDGE and under this size is left untouched:
 * re-encoding it would cost detail for a few saved kilobytes.
 */
const SKIP_BELOW_BYTES = 400 * 1024;

/**
 * The only image types the API accepts, mapped to the one extension each may
 * carry. The backend requires the extension to match the content type exactly
 * ("jpg", never "jpeg"), so a re-encoded file is renamed from this map.
 */
const EXTENSION_BY_TYPE = new Map<string, string>([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

export interface PreparedThumbnail {
  /** The file to upload: the compressed copy, or the original when compressing would not help. */
  file: File;
  /** Size of the file the user picked, so the UI can report what was saved. */
  originalBytes: number;
  /** False when the original is being returned unchanged. */
  compressed: boolean;
}

/**
 * Re-encode `file` to at most {@link MAX_EDGE} on its longest edge and return
 * whichever of the two files is smaller.
 */
export async function compressThumbnail(file: File): Promise<PreparedThumbnail> {
  const unchanged: PreparedThumbnail = {
    file,
    originalBytes: file.size,
    compressed: false,
  };

  if (file.size === 0 || !EXTENSION_BY_TYPE.has(file.type)) return unchanged;
  if (typeof createImageBitmap !== "function") return unchanged;

  let bitmap: ImageBitmap | null = null;
  try {
    // "from-image" applies the EXIF rotation, so a phone photo is not stored sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fit(bitmap.width, bitmap.height);

    const sameSize = width === bitmap.width && height === bitmap.height;
    if (sameSize && file.size <= SKIP_BELOW_BYTES) return unchanged;

    for (const type of encodeOrder(file.type)) {
      const blob = await encode(bitmap, width, height, type);
      // A canvas silently falls back to PNG for a type it cannot encode, so the
      // result is only usable when it came back as the type that was asked for.
      if (!blob || blob.type !== type || blob.size === 0) continue;
      if (blob.size >= file.size || blob.size > MAX_THUMBNAIL_BYTES) continue;

      const extension = EXTENSION_BY_TYPE.get(type);
      if (!extension) continue;
      const candidate = new File([blob], renameTo(file.name, extension), { type });
      if (!checkThumbnailFile(candidate).ok) continue;

      return { file: candidate, originalBytes: file.size, compressed: true };
    }
    return unchanged;
  } catch {
    // Decoding is unsupported or the image is broken: upload what was picked.
    return unchanged;
  } finally {
    bitmap?.close();
  }
}

/**
 * WebP first: it is the smallest of the three and keeps transparency. The
 * source's own format is the fallback, because converting a PNG to JPEG would
 * flatten its alpha channel to black. Scaling down alone still shrinks it.
 */
function encodeOrder(sourceType: string): string[] {
  return sourceType === "image/webp" ? ["image/webp"] : ["image/webp", sourceType];
}

/** The given size scaled to fit within MAX_EDGE, never scaled up. */
function fit(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_EDGE) return { width, height };
  const scale = MAX_EDGE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Draw the bitmap at the target size and encode it. Returns null instead of
 * throwing when this browser cannot encode `type`, so the caller can try the
 * next one.
 */
async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  type: string,
): Promise<Blob | null> {
  try {
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) return null;
      paint(context, bitmap, width, height);
      return await canvas.convertToBlob({ type, quality: QUALITY });
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    paint(context, bitmap, width, height);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, type, QUALITY);
    });
  } catch {
    return null;
  }
}

function paint(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
): void {
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
}

/** Replace the file's extension, keeping its name so the creator still recognises it. */
function renameTo(filename: string, extension: string): string {
  const base = filename.replace(/\.[^./\\]*$/, "").trim();
  return `${base || "thumbnail"}.${extension}`;
}

/** Short size label for the UI, e.g. "4.2 MB" or "180 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
