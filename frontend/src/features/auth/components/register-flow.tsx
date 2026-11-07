"use client";

import * as React from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "./auth-shell";
import { RegisterForm } from "./register-form";
import { ResendVerification } from "./resend-verification";

/**
 * Sign-up page body: the form, then the "Check your email" panel once the
 * account exists. Focus moves to the new heading so the outcome is announced.
 *
 * The API logs the user in at registration and has no endpoint to change the
 * email address, so the design's "Use a different email" action is replaced by
 * a way forward into the Studio.
 */
export function RegisterFlow() {
  const [email, setEmail] = React.useState<string | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (email) headingRef.current?.focus();
  }, [email]);

  if (!email) {
    return (
      <AuthShell
        heading="Create your account"
        subheading="Join the community and start publishing AI films."
      >
        <RegisterForm onRegistered={setEmail} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      heading="Check your email"
      headingRef={headingRef}
      subheading={
        <>
          We sent a verification link to{" "}
          <strong className="break-all font-semibold text-foreground" title={email}>
            {email}
          </strong>
          . Open it to activate your account.
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <MailCheck className="size-8 text-primary" aria-hidden="true" />
        <ResendVerification />
        <Button asChild variant="ghost" className="w-full">
          <Link href="/studio">Continue to Creator Studio</Link>
        </Button>
      </div>
    </AuthShell>
  );
}
