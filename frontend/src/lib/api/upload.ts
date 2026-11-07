import type { UploadTarget } from "@/types/domain";
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
