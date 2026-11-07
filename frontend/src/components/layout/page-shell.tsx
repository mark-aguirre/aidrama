import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { MobileHeader } from "@/components/layout/mobile-header";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

/** Bottom padding that keeps content clear of the fixed tab bar below `lg`. */
export const MOBILE_BAR_PADDING =
  "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0";

/** Mobile top bar. usePathname needs a Suspense boundary under cacheComponents. */
export function MobileShellHeader() {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="h-14 border-b border-white/5 lg:hidden"
        />
      }
    >
      <MobileHeader />
    </Suspense>
  );
}

/** Mobile bottom tab bar. Mount at most once per page. */
export function MobileShellTabBar() {
  return (
    <Suspense
      fallback={
        <div
          aria-hidden="true"
          className="fixed inset-x-0 bottom-0 z-40 h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t border-white/5 bg-background/80 backdrop-blur-xl lg:hidden"
        />
      }
    >
      <MobileTabBar />
    </Suspense>
  );
}

/**
 * Public page wrapper: navbar, content, footer.
 *
 * At `lg` and above the desktop navbar renders as before. Below `lg` it is
 * replaced by the mobile header and a fixed bottom tab bar, and the wrapper
 * reserves space so the bar never covers content.
 *
 * By default the content sits in a centered, padded `<main>`. Pass `bare` when
 * the page owns its layout (full-bleed hero, wide player): children must then
 * render their own `<main>`.
 */
export function PageShell({
  children,
  bare = false,
}: {
  children: React.ReactNode;
  bare?: boolean;
}) {
  return (
    <div className={`flex flex-1 flex-col ${MOBILE_BAR_PADDING}`}>
      {/* `contents` drops the wrapper box so the navbar's sticky positioning is unchanged. */}
      <div className="hidden lg:contents">
        <Navbar />
      </div>
      <MobileShellHeader />
      {bare ? (
        children
      ) : (
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-10 sm:px-8">
          {children}
        </main>
      )}
      <Footer />
      <MobileShellTabBar />
    </div>
  );
}

/** Page title with an optional lead paragraph. */
export function PageTitle({
  title,
  lead,
}: {
  title: string;
  lead?: string;
}) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-3xl text-foreground sm:text-4xl">
        {title}
      </h1>
      {lead && <p className="mt-2 text-sm text-muted-foreground">{lead}</p>}
    </div>
  );
}
