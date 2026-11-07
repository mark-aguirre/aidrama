"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/auth/redirect";
import { useRestoredSession } from "../hooks/use-restored-session";

/**
 * Client-side guard for Studio screens that call creator-only endpoints.
 *
 * This is a usability layer: the API enforces authentication and the CREATOR
 * role on every `/creator/*` and `/uploads/*` call. Anonymous visitors are sent
 * to the login page and returned to `returnTo` afterwards.
 */
export function RequireCreator({
  returnTo,
  children,
}: {
  returnTo: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const session = useRestoredSession();

  React.useEffect(() => {
    if (session.status === "anonymous") router.replace(loginUrl(returnTo));
  }, [session.status, returnTo, router]);

  if (session.user) {
    if (!session.user.roles.includes("CREATOR")) {
      return (
        <Notice icon={<ShieldAlert aria-hidden="true" />} title="Creator access required">
          Your account doesn&apos;t have access to the Creator Studio.
        </Notice>
      );
    }
    return <>{children}</>;
  }

  if (session.failed) {
    return (
      <Notice icon={<AlertCircle aria-hidden="true" />} title="We couldn't check your session">
        Check your connection and try again.
        <Button onClick={session.retry} className="mt-4">
          Try again
        </Button>
      </Notice>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {session.status === "anonymous" ? (
        <>
          Redirecting to{" "}
          <Link href={loginUrl(returnTo)} className="text-primary hover:underline">
            log in
          </Link>
        </>
      ) : (
        "Checking your session"
      )}
    </div>
  );
}

function Notice({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-media border border-border bg-surface p-8 text-center text-sm text-muted-foreground"
    >
      <span className="text-destructive [&_svg]:size-6">{icon}</span>
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      <p>{children}</p>
    </div>
  );
}
