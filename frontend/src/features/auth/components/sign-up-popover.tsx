"use client";

import * as React from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import "./sign-in-glossy.css";
import { RegisterForm } from "./register-form";
import { ResendVerification } from "./resend-verification";

/**
 * The desktop navbar's "Get started" button with the sign-up form in a popover
 * anchored under it, matching `SignInPopover`. It owns its own open and
 * two-step state: the register form, then the "Check your email" panel once
 * the account exists (the API logs the user in at registration).
 *
 * Radix Popover handles the interaction: focus moves to the first form field
 * (Display name) on open, Escape and outside-click close it, and Escape
 * returns focus to the button. Following a "Log in" link closes the popover.
 */
export function SignUpPopover() {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState<string | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  const close = React.useCallback(() => setOpen(false), []);

  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    // Reset back to the form once the popover fully closes.
    if (!next) setEmail(null);
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm">
          Get started
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="signin-glossy max-h-[calc(100dvh-5.5rem)] w-[22rem] overflow-y-auto overscroll-contain"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        {email ? (
          <>
            <div className="mb-4 flex flex-col gap-1">
              <h2
                id={titleId}
                className="font-display text-lg leading-tight text-foreground"
              >
                Check your email
              </h2>
              <p id={descriptionId} className="text-sm text-muted-foreground">
                We sent a verification link to{" "}
                <strong
                  className="break-all font-semibold text-foreground"
                  title={email}
                >
                  {email}
                </strong>
                . Open it to activate your account.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <MailCheck className="size-8 text-primary" aria-hidden="true" />
              <ResendVerification />
              <Button asChild variant="ghost" className="w-full">
                <Link href="/studio" onClick={close}>
                  Continue to Creator Studio
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-1">
              <h2
                id={titleId}
                className="font-display text-lg leading-tight text-foreground"
              >
                Create your account
              </h2>
              <p id={descriptionId} className="text-sm text-muted-foreground">
                Join the community and start publishing AI films.
              </p>
            </div>

            <RegisterForm
              idPrefix="nav-signup-"
              onRegistered={setEmail}
              onSwitchToSignIn={close}
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
