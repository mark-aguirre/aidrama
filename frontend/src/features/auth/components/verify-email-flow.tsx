"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { useRestoredSession } from "../hooks/use-restored-session";
import { AuthShell } from "./auth-shell";
import { ResendVerification } from "./resend-verification";
import { useSignIn } from "./sign-in-provider";

type VerifyState = "verifying" | "success" | "invalid" | "error";

/**
 * Result of following the emailed link (/verify-email?token=...).
 *
 * The API reports an expired and a malformed token the same way
 * (400 INVALID_VERIFICATION_TOKEN), so both land in the "invalid" state.
 */
export function VerifyEmailFlow({ token }: { token: string | null }) {
  const [state, setState] = React.useState<VerifyState>(
    token ? "verifying" : "invalid",
  );
  const [attempt, setAttempt] = React.useState(0);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const session = useRestoredSession();
  const signIn = useSignIn();

  React.useEffect(() => {
    if (!token) return;
    let active = true;
    api.verifyEmail(token).then(
      () => active && setState("success"),
      (error: unknown) => {
        if (!active) return;
        setState(
          isApiError(error, "INVALID_VERIFICATION_TOKEN") ? "invalid" : "error",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [token, attempt]);

  React.useEffect(() => {
    if (state !== "verifying") headingRef.current?.focus();
  }, [state]);

  function retry() {
    setState("verifying");
    setAttempt((n) => n + 1);
  }

  if (state === "verifying") {
    return (
      <AuthShell
        heading="Verifying your email…"
        subheading="This only takes a moment."
        headingRef={headingRef}
      >
        <div aria-busy="true" role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Checking your link
        </div>
      </AuthShell>
    );
  }

  if (state === "success") {
    return (
      <AuthShell
        heading="Email verified"
        subheading="Your account is ready."
        headingRef={headingRef}
      >
        <div className="flex flex-col gap-3">
          <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
          <Button asChild className="w-full">
            <Link href="/studio">Go to Creator Studio</Link>
          </Button>
          <Button asChild variant="secondary" className="w-full">
            <Link href="/">Browse AI Drama</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (state === "error") {
    return (
      <AuthShell
        heading="We couldn't verify your email"
        subheading="Something went wrong on our side. Your link may still work."
        headingRef={headingRef}
      >
        <div className="flex flex-col gap-3">
          <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
          <Button onClick={retry} className="w-full">
            Try again
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="This link is not valid"
      subheading="The verification link is invalid or has expired."
      headingRef={headingRef}
    >
      <div role="alert" className="flex flex-col gap-3">
        <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
        {session.status === "authenticated" ? (
          <ResendVerification label="Resend verification email" />
        ) : (
          <Button onClick={() => signIn.open()} className="w-full">
            Sign in to resend the email
          </Button>
        )}
      </div>
    </AuthShell>
  );
}
