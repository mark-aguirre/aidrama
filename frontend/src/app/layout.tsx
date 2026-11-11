import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

// Interface and headline type: a bold geometric sans.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

// Editorial accent: used only for featured titles and the "your story" script.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: "AI Drama",
    template: "%s · AI Drama",
  },
  description:
    "Watch, create, and share AI-generated dramas in any genre, any language, anytime.",
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  // iOS home-screen install: standalone, with the status bar drawn over the
  // app's own near-black header (the header pads for the safe-area inset).
  appleWebApp: {
    capable: true,
    title: "AI Drama",
    statusBarStyle: "black-translucent",
  },
};

// `cover` lets iOS report real env(safe-area-inset-*) values, which the
// mobile header and tab bar use to clear the status bar and home indicator.
// Pinch zoom stays enabled on purpose (accessibility). `themeColor` tints the
// browser UI and the standalone status bar to match --background.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0a0a0d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
