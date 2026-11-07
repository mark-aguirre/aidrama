"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Video } from "@/types/domain";

const TOAST_MS = 2500;

/**
 * An absolute link to an app path (e.g. `/watch/slug`), on the origin the
 * visitor is browsing. Browser only: it reads `window.location`.
 */
function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/** The visitor closed the native share sheet without choosing a target. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Copies `text` with a hidden, selected textarea. Used when the async
 * Clipboard API is missing (it needs a secure context, so it is absent on a
 * plain-HTTP LAN origin) or refuses the write. Puts focus back where it was.
 */
function copyWithSelection(text: string): boolean {
  const previouslyFocused = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  try {
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or blocked by policy: try the selection fallback.
    }
  }
  return copyWithSelection(text);
}

/**
 * Shares a page link (a video's watch page, a series page). Where the browser
 * has the Web Share API (phones, and some desktop browsers) it opens the
 * native share sheet with the title and link. Everywhere else it copies the
 * link and shows the returned `toast`. Dismissing the share sheet does nothing.
 */
export function useShareLink({ title, path }: { title: string; path: string }) {
  const [message, setMessage] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | undefined>(undefined);
  const busy = React.useRef(false);

  React.useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function showToast(text: string) {
    window.clearTimeout(toastTimer.current);
    setMessage(text);
    toastTimer.current = window.setTimeout(() => setMessage(null), TOAST_MS);
  }

  async function share() {
    // A second tap while the share sheet is open would make the browser throw.
    if (busy.current) return;
    busy.current = true;
    try {
      const url = absoluteUrl(path);

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title, url });
          return;
        } catch (error) {
          if (isAbortError(error)) return;
          // The share sheet failed for another reason; copy the link instead.
        }
      }

      showToast(
        (await copyToClipboard(url)) ? "Link copied" : "Couldn't copy the link",
      );
    } finally {
      busy.current = false;
    }
  }

  const toast = (
    <>
      {/* Always mounted so screen readers announce the text when it changes. */}
      <span role="status" className="sr-only">
        {message ?? ""}
      </span>
      {message &&
        createPortal(
          // Portaled to <body> so no transformed ancestor can displace it. It
          // clears the fixed mobile tab bar (h-14 plus the safe-area inset).
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 lg:bottom-8"
          >
            <div className="animate-enter rounded-md border border-border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-xl">
              {message}
            </div>
          </div>,
          document.body,
        )}
    </>
  );

  return { share, toast };
}

/**
 * Share action for the watch page (see `useShareLink`).
 *
 * `disabled` is the watch page's own gate (the video is still processing);
 * `describedBy` points at the hint that explains it.
 */
export function ShareButton({
  video,
  disabled = false,
  describedBy,
}: {
  video: Pick<Video, "slug" | "title">;
  disabled?: boolean;
  describedBy?: string;
}) {
  const { share, toast } = useShareLink({
    title: video.title,
    path: `/watch/${encodeURIComponent(video.slug)}`,
  });

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void share()}
        disabled={disabled}
        aria-describedby={describedBy}
      >
        <Share2 aria-hidden="true" />
        Share
      </Button>
      {toast}
    </>
  );
}
