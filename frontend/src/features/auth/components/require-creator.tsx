"use client";

import * as React from "react";
import { AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRestoredSession } from "../hooks/use-restored-session";
import { useSignIn } from "./sign-in-provider";

/**
 * Client-side guard for Studio screens that call creator-only endpoints.
 *
 * This is a usability layer: the API enforces authentication and the CREATOR
 * role on every `/creator/*` and `/uploads/*` call. Anonymous visitors get the
 * shared sign-in panel; a successful login refreshes the session in place and
 * the gate renders its children.
 */
export function RequireCreator({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useRestoredSession();
  const signIn = useSignIn();

  const anonymous = session.status === "anonymous";

  // Open the sign-in panel as soon as we know the visitor is anonymous.
  React.useEffect(() => {
    if (anonymous) signIn.open();
  }, [anonymous, signIn]);

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

  if (anonymous) {
    return (
      <Notice icon={<ShieldAlert aria-hidden="true" />} title="Sign in to continue">
        The Creator Studio is for signed-in creators.
        <Button onClick={() => signIn.open()} className="mt-4">
          Sign in
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
      Checking your session
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
