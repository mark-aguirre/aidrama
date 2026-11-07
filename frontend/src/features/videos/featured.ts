import { cache } from "react";
import { api } from "@/lib/api/client";
import type { FeaturedTitle } from "@/types/domain";

/**
 * The home feed's featured title, fetched once per server request (React
 * `cache`), so the Explore backdrop and the grid's "Featured" badge share one
 * GET /home. Decoration only: a failed feed resolves to null rather than
 * breaking the page.
 */
export const getFeaturedTitle = cache(
  async (): Promise<FeaturedTitle | null> => {
    try {
      return (await api.getHomeFeed()).featured;
    } catch {
      return null;
    }
  },
);
