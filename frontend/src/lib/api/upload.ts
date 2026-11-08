import type {
  CompletedUploadPart,
  UploadMultipart,
  UploadTarget,
} from "@/types/domain";
import { ApiError, networkError } from "./errors";

/**
 * Browser PUT of the raw File to the signed storage URL (API-CONTRACT.md,
 * "Uploads"). Sends exactly `upload.headers` and nothing else: no
 * Authorization header, because the URL is already signed and extra headers can
 * break the signature. XMLHttpRequest is used because `fetch` cannot report
 * upload progress.
 */
export function putFileToSignedUrl(
  target: UploadTarget,
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<void> {
  const { signal, onProgress } = options;

  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) {
      xhr.setRequestHeader(name, value);
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(
        new ApiError({
          status: xhr.status,
          code: "UPLOAD_REJECTED",
          message: "The storage service rejected the file. Try the upload again.",
        }),
      );
    };
    xhr.onerror = () => {
      cleanup();
      reject(networkError());
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    xhr.send(file);
  });
}

/**
 * Browser PUT of one part (a File slice) to its presigned URL. Resolves with the ETag the storage
 * returned, which the caller must echo back when completing the multipart upload. `onProgress`
 * reports bytes transferred for this part so the caller can aggregate across parts. No headers are
 * set: a presigned part URL signs none, and an extra header can break the signature.
 */
function putPart(
  url: string,
  blob: Blob,
  options: {
    signal?: AbortSignal;
    onProgress?: (loaded: number) => void;
  } = {},
): Promise<string> {
  const { signal, onProgress } = options;

  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload aborted", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded);
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        // The storage returns the part's ETag; it is required to assemble the object on complete.
        const eTag = xhr.getResponseHeader("ETag");
        if (!eTag) {
          reject(
            new ApiError({
              status: xhr.status,
              code: "UPLOAD_PART_NO_ETAG",
              message:
                "The storage did not return an ETag for a part. The upload cannot be completed.",
            }),
          );
          return;
        }
        onProgress?.(blob.size);
        resolve(eTag);
        return;
      }
      reject(
        new ApiError({
          status: xhr.status,
          code: "UPLOAD_REJECTED",
          message: "The storage service rejected a part. Try the upload again.",
        }),
      );
    };
    xhr.onerror = () => {
      cleanup();
      reject(networkError());
    };
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Upload aborted", "AbortError"));
    };

    xhr.send(blob);
  });
}

/**
 * Uploads a large File in parts according to a multipart plan: slices the file into
 * `partSizeBytes` chunks (the last part is the remainder), PUTs each to its presigned URL in order,
 * and returns the collected part ETags for POST /uploads/{id}/complete-multipart. Progress is the
 * total bytes transferred across all parts, so the caller sees one smooth 0..100 percent.
 *
 * Parts are uploaded sequentially: it keeps memory flat (one slice in flight), makes aggregate
 * progress monotonic, and matches the API's one-in-flight-session-per-video rule. The ETag order
 * does not matter to the server, which sorts by part number, but parts are sent in order anyway.
 */
export async function putPartsToSignedUrls(
  plan: UploadMultipart,
  file: File,
  options: {
    signal?: AbortSignal;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<CompletedUploadPart[]> {
  const { signal, onProgress } = options;
  const { partSizeBytes, parts } = plan;

  const completed: CompletedUploadPart[] = [];
  // Bytes fully transferred by parts that already finished; the in-flight part adds to this.
  let completedBytes = 0;
  const total = file.size || 1;

  for (const part of parts) {
    const start = (part.partNumber - 1) * partSizeBytes;
    const end = Math.min(start + partSizeBytes, file.size);
    const blob = file.slice(start, end);

    const eTag = await putPart(part.url, blob, {
      signal,
      onProgress: (loadedInPart) => {
        const loaded = Math.min(loadedInPart, blob.size);
        onProgress?.(Math.round(((completedBytes + loaded) / total) * 100));
      },
    });
    completedBytes += blob.size;
    completed.push({ partNumber: part.partNumber, eTag });
    onProgress?.(Math.round((completedBytes / total) * 100));
  }

  return completed;
}
