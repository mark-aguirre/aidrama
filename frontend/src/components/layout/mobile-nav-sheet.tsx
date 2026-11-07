"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CircleUserRound,
  Film,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Tv,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSignIn } from "@/features/auth/components/sign-in-provider";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useRestoredSession } from "@/features/auth/hooks/use-restored-session";
import type { AuthUser } from "@/types/domain";

const ROW_CLASS =
  "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent/60 active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

const BROWSE_LINKS = [
  { href: "/series", label: "Series", icon: Tv },
  { href: "/movies", label: "Films", icon: Film },
  { href: "/shorts", label: "Shorts", icon: Zap },
] as const;

const NOTIFICATIONS_LINK = {
  href: "/notifications",
  label: "Notifications",
  icon: Bell,
} as const;

function SheetLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <li>
      <SheetClose asChild>
        <Link href={href} className={ROW_CLASS}>
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
          {children}
        </Link>
      </SheetClose>
    </li>
  );
}

function AccountInitial({ user }: { user: AuthUser | null }) {
  const initial = user?.displayName.trim().charAt(0).toUpperCase();
  if (!initial) {
    return <CircleUserRound className="size-6" aria-hidden="true" />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-foreground"
    >
      {initial}
    </span>
  );
}

/**
 * Account control for the mobile header plus the "More" bottom sheet it opens.
 * Signed-in users get an avatar button; visitors get "Sign in" and a menu
 * button. While the session is restoring only the menu button shows, with the
 * public links, so nothing flickers between guest and signed-in states.
 */
export function MobileNavSheet() {
  const session = useRestoredSession();
  const { logout, pending, failed } = useLogout();
  const signIn = useSignIn();
  const [open, setOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const signInRequested = React.useRef(false);

  const authenticated = session.status === "authenticated";
  const anonymous = session.status === "anonymous";

  async function handleLogout() {
    const ok = await logout();
    if (ok) setOpen(false);
  }

  /** Close the sheet first; its close handler then opens the sign-in panel. */
  function openSignInAfterClose() {
    signInRequested.current = true;
    setOpen(false);
  }

  /**
   * Runs when the sheet has finished closing. If the visitor asked to sign in,
   * open the panel now (so the two modals never overlap) and send focus back
   * to the menu button when the panel closes, since the "Sign in" row is gone.
   */
  function handleSheetCloseAutoFocus(event: Event) {
    if (!signInRequested.current) return;
    signInRequested.current = false;
    event.preventDefault();
    signIn.open({ returnFocusTo: menuButtonRef.current });
  }

  return (
    <div className="flex items-center gap-1">
      {anonymous && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11"
          aria-haspopup="dialog"
          onClick={() => signIn.open()}
        >
          Sign in
        </Button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            className="size-11 rounded-full"
            aria-label={authenticated ? "Account menu" : "Menu"}
          >
            {authenticated ? (
              <AccountInitial user={session.user} />
            ) : (
              <Menu className="size-6" aria-hidden="true" />
            )}
          </Button>
        </SheetTrigger>

        <SheetContent onCloseAutoFocus={handleSheetCloseAutoFocus}>
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">
              Browse more sections and manage your account.
            </SheetDescription>
          </SheetHeader>

          {failed && (
            <p
              role="alert"
              className="mx-4 mb-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive"
            >
              We couldn&apos;t finish logging out. Reload the page and try
              again.
            </p>
          )}

          <nav aria-label="More" className="px-2 pb-3">
            <ul className="flex flex-col">
              {authenticated && (
                <SheetLink href="/studio" icon={LayoutDashboard}>
                  Studio
                </SheetLink>
              )}
              {authenticated && (
                <SheetLink
                  href={NOTIFICATIONS_LINK.href}
                  icon={NOTIFICATIONS_LINK.icon}
                >
                  {NOTIFICATIONS_LINK.label}
                </SheetLink>
              )}
              {BROWSE_LINKS.map((link) => (
                <SheetLink key={link.href} href={link.href} icon={link.icon}>
                  {link.label}
                </SheetLink>
              ))}
              {!authenticated && (
                <SheetLink
                  href={NOTIFICATIONS_LINK.href}
                  icon={NOTIFICATIONS_LINK.icon}
                >
                  {NOTIFICATIONS_LINK.label}
                </SheetLink>
              )}
            </ul>

            {authenticated && (
              <>
                <hr className="my-2 border-border" />
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={pending}
                  className={`${ROW_CLASS} text-destructive`}
                >
                  <LogOut className="size-5" aria-hidden="true" />
                  Log out
                </button>
              </>
            )}

            {anonymous && (
              <>
                <hr className="my-2 border-border" />
                <ul className="flex flex-col gap-2">
                  <li>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={openSignInAfterClose}
                      className={ROW_CLASS}
                    >
                      <LogIn
                        className="size-5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      Sign in
                    </button>
                  </li>
                  <li>
                    <SheetClose asChild>
                      <Button size="lg" asChild className="w-full">
                        <Link href="/signup">
                          <UserPlus aria-hidden="true" />
                          Get started
                        </Link>
                      </Button>
                    </SheetClose>
                  </li>
                </ul>
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
