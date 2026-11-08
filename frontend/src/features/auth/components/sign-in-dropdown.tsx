"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { MailCheck, X } from "lucide-react";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import "@/components/ui/sheet.css";
import "./sign-in-dropdown.css";
import "./sign-in-glossy.css";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";
import { ResendVerification } from "./resend-verification";

export type AuthMode = "sign-in" | "sign-up";

export interface SignInDropdownProps {
  open: boolean;
  mode: AuthMode;
  onOpenChange: (open: boolean) => void;
  /** Switch the panel between the sign-in and sign-up forms in place. */
  onModeChange: (mode: AuthMode) => void;
  /** Runs after a successful login; the host closes the panel and refreshes. */
  onSuccess: () => void;
  /** Radix focus-return hook; the host moves focus back to the control that opened the panel. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * The login or sign-up form in place: a dropdown card under the navbar from
 * `sm` up and a bottom sheet on phones. Built on the app's Radix dialog
 * primitive (there is no popover primitive), so it keeps the focus trap,
 * Escape and outside-click to close, scroll lock, and the `dialog` role with
 * its title and description. Focus lands on the first form field when it opens.
 *
 * It is controlled and has no trigger of its own: the "Sign in" and "Get
 * started" controls in the mobile header, the mobile menu sheet and the tab
 * bar, the Studio gate, and the watch page's Like button open this single
 * instance through `useSignIn` / `useSignUp`. The desktop navbar uses the
 * anchored `SignInPopover` / `SignUpPopover` instead.
 */
export function SignInDropdown({
  open,
  mode,
  onOpenChange,
  onModeChange,
  onSuccess,
  onCloseAutoFocus,
}: SignInDropdownProps) {
  // The address the account was just created for; drives the "Check your
  // email" step of the sign-up flow. Reset whenever the panel closes (every
  // close path routes through `handleOpenChange`).
  const [registeredEmail, setRegisteredEmail] = React.useState<string | null>(
    null,
  );

  function handleOpenChange(next: boolean) {
    if (!next) setRegisteredEmail(null);
    onOpenChange(next);
  }

  // Switching forms always starts the target form fresh (no stale "check your
  // email" step carried over).
  function switchMode(next: AuthMode) {
    setRegisteredEmail(null);
    onModeChange(next);
  }

  const showSignUp = mode === "sign-up";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay className="bg-black/60 sm:bg-transparent sm:backdrop-blur-none" />
        <DialogPrimitive.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className="signin-panel signin-glossy fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-popover p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-popover-foreground focus-visible:outline-none sm:inset-x-auto sm:bottom-auto sm:right-[max(2rem,calc((100vw-1400px)/2+2rem))] sm:top-[4.25rem] sm:max-h-[calc(100dvh-5.5rem)] sm:w-[22rem] sm:rounded-lg sm:border sm:shadow-xl"
        >
          {showSignUp && registeredEmail ? (
            <>
              <div className="mb-4 flex flex-col gap-1">
                <DialogTitle>Check your email</DialogTitle>
                <DialogDescription>
                  We sent a verification link to{" "}
                  <strong
                    className="break-all font-semibold text-foreground"
                    title={registeredEmail}
                  >
                    {registeredEmail}
                  </strong>
                  . Open it to activate your account.
                </DialogDescription>
              </div>
              <div className="flex flex-col gap-4">
                <MailCheck className="size-8 text-primary" aria-hidden="true" />
                <ResendVerification />
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => onOpenChange(false)}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : showSignUp ? (
            <>
              <div className="mb-4 flex flex-col gap-1">
                <DialogTitle>Create your account</DialogTitle>
                <DialogDescription>
                  Join the community and start publishing AI films.
                </DialogDescription>
              </div>
              <RegisterForm
                idPrefix="signup-"
                onRegistered={setRegisteredEmail}
                onSwitchToSignIn={() => switchMode("sign-in")}
              />
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-1">
                <DialogTitle>Welcome back</DialogTitle>
                <DialogDescription>Log in to your account.</DialogDescription>
              </div>
              <LoginForm
                idPrefix="signin-"
                onSuccess={onSuccess}
                onSwitchToSignUp={() => switchMode("sign-up")}
              />
            </>
          )}

          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-3 sm:top-3 sm:size-9"
          >
            <X className="size-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
