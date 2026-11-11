import type { MetadataRoute } from "next";

/**
 * Web app manifest: lets phones install AI Drama to the home screen and open
 * it standalone (no browser chrome). Colors match the globals.css tokens
 * (--background and --primary). Icons are static files in /public/icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Drama",
    short_name: "AI Drama",
    description:
      "Watch, create, and share AI-generated dramas in any genre, any language, anytime.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0d",
    theme_color: "#0a0a0d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
