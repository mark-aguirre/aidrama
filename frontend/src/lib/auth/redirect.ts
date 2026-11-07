/** Where to go after login when no valid `next` is given. */
export const DEFAULT_AFTER_LOGIN = "/studio";

/**
 * Accept only same-origin paths for post-login redirects, so a crafted
 * `?next=` cannot send the user to another site (open redirect).
 */
export function safeRedirectPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return DEFAULT_AFTER_LOGIN;
  }
  if (next.includes("\\")) return DEFAULT_AFTER_LOGIN;
  try {
    const url = new URL(next, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return DEFAULT_AFTER_LOGIN;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}

/** Login URL that returns the user to `path` afterwards. */
export function loginUrl(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}
