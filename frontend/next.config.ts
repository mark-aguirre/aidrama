import type { NextConfig } from "next";

/**
 * Hosts that serve API-provided images (thumbnails, avatars, posters), as a
 * comma-separated list. Server-side build setting, not a secret and not
 * exposed to the browser. The API contract does not name the media host, so
 * it is configured per environment.
 *
 * Each entry is a hostname, optionally with a scheme and/or port, so
 * non-TLS self-hosted storage (e.g. SeaweedFS on a LAN) works:
 *   MEDIA_IMAGE_HOSTS=http://192.168.100.50:8333,cdn.example.com
 * A bare hostname defaults to https on the default port.
 */
const mediaPatterns = (process.env.MEDIA_IMAGE_HOSTS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const withScheme = /^https?:\/\//.test(entry) ? entry : `https://${entry}`;
    const url = new URL(withScheme);
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
    };
  });

const nextConfig: NextConfig = {
  /* config options here */
  // Emit .next/standalone with a minimal server.js so the Docker image can run
  // without installing node_modules. See deploy-to-docker.sh / Dockerfile.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // The image optimizer blocks fetching from private IPs (SSRF guard).
    // Self-hosted storage on the LAN (e.g. SeaweedFS at 192.168.x.x) needs this
    // lifted. It is on automatically outside production; a production LAN
    // deployment (no public CDN) opts in with ALLOW_LOCAL_IP_IMAGES=true.
    // When media is served over a public https CDN, leave this off.
    dangerouslyAllowLocalIP:
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_LOCAL_IP_IMAGES === "true",
    remotePatterns: [
      // Mock thumbnail/avatar hosts still used by the mocked screens.
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      ...mediaPatterns,
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
