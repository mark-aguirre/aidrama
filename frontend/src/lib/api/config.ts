/**
 * Base URL of the Spring Boot API: NEXT_PUBLIC_API_BASE_URL, the only
 * variable of this app that is exposed to the browser. It is a URL, not a secret.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
