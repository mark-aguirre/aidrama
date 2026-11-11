"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  Clapperboard,
  Compass,
  Film,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Tv,
  Upload,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSignIn,
  useSignUp,
} from "@/features/auth/components/sign-in-provider";
import { useLogout } from "@/features/auth/hooks/use-logout";
import { useRestoredSession } from "@/features/auth/hooks/use-restored-session";
import { cn } from "@/lib/utils";

const ROW_CLASS =
  "flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-foreground transition-[background-color,transform,opacity] duration-150 hover:bg-accent/60 active:scale-[0.98] active:bg-accent/60 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

interface Destination {
  href: string;
  label: string;
  icon: LucideIcon;
}

const CREATOR_LINKS: readonly Destination[] = [
  { href: "/studio", label: "Studio", icon: LayoutDashboard },
  { href: "/studio/content", label: "My content", icon: FolderOpen },
  { href: "/studio/upload", label: "Upload", icon: Upload },
];

const NOTIFICATIONS_LINK: Destination = {
  href: "/notifications",
  label: "Notifications",
  icon: Bell,
};

const BROWSE_LINKS: readonly Destination[] = [
  { href: "/explore", label: "Browse all", icon: Compass },
  { href: "/series", label: "Series", icon: Tv },
  { href: "/movies", label: "Films", icon: Film },
  { href: "/shorts", label: "Shorts", icon: Zap },
];

function LinkGroup({
  title,
  links,
}: {
  title: string;
  links: readonly Destination[];
}) {
  const headingId = `profile-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="mb-1 px-3 text-xs font-semibold text-muted-foreground"
      >
        {title}
      </h2>
      <ul className="flex flex-col">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={ROW_CLASS}>
              <Icon
                className="size-5 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex-1">{label}</span>
              <ChevronRight
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff5a7e] to-[#d1245a] text-xl font-bold text-white"
    >
      {initial || <Clapperboard className="size-6" />}
    </span>
  );
}

function ProfileSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading your profile">
      <div className="h-[88px] animate-pulse rounded-media bg-surface-2 motion-reduce:animate-none" />
    </div>
  );
}

/**
 * Phone profile screen. Holds what the old "More" sheet held: who you are,
 * Studio and My content, notifications, the browse sections, and Log out.
 * Guests see sign-in and sign-up buttons (the shared inline panel) instead of
 * an identity; the browse links stay available to everyone.
 */
export function ProfileView() {
  const session = useRestoredSession();
  const { logout, pending, failed } = useLogout();
  const signIn = useSignIn();
  const signUp = useSignUp();

  const user = session.user;
  const authenticated = session.status === "authenticated" && user !== null;
  const anonymous = session.status === "anonymous";

  const yourSpace = authenticated
    ? [...CREATOR_LINKS, NOTIFICATIONS_LINK]
    : [NOTIFICATIONS_LINK];

  return (
    <div className="flex max-w-xl flex-col gap-6">
      {session.failed && !user && (
        <div
          role="alert"
          className="rounded-media border border-destructive/40 p-4 text-sm"
        >
          <p className="text-destructive">We couldn&apos;t check your session.</p>
          <Button className="mt-3" variant="outline" onClick={session.retry}>
            Try again
          </Button>
        </div>
      )}

      {authenticated && (
        <section
          aria-label="Your account"
          className="flex items-center gap-4 rounded-media border border-white/5 bg-surface p-4"
        >
          <Avatar name={user.displayName} />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">
              {user.displayName}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              @{user.username}
            </p>
          </div>
        </section>
      )}

      {anonymous && (
        <section
          aria-label="Account"
          className="rounded-media border border-white/5 bg-surface p-4"
        >
          <p className="text-base font-semibold text-foreground">
            Sign in to your account
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Save titles to My List and upload your own dramas.
          </p>
          <div className="mt-4 flex gap-3">
            <Button
              size="lg"
              className="flex-1 rounded-full"
              aria-haspopup="dialog"
              onClick={() => signIn.open()}
            >
              Sign in
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1 rounded-full"
              aria-haspopup="dialog"
              onClick={() => signUp.open()}
            >
              Get started
            </Button>
          </div>
        </section>
      )}

      {session.status === "unknown" && !session.failed && <ProfileSkeleton />}

      <LinkGroup title="Your space" links={yourSpace} />
      <LinkGroup title="Browse" links={BROWSE_LINKS} />

      {authenticated && (
        <div>
          {failed && (
            <p
              role="alert"
              className="mb-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive"
            >
              We couldn&apos;t finish logging out. Reload the page and try
              again.
            </p>
          )}
          <button
            type="button"
            onClick={logout}
            disabled={pending}
            className={cn(ROW_CLASS, "text-destructive")}
          >
            <LogOut className="size-5" aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
