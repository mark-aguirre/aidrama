"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import "./sign-in-glossy.css";
import { LoginForm } from "./login-form";

/**
 * The desktop navbar's "Sign in" button with the login form in a popover
 * anchored under it. It owns its own open state; the shared sheet and dialog
 * in `SignInProvider` serve every other sign-in control.
 *
 * Radix Popover handles the interaction: focus moves to the first form field
 * (Email) on open, Escape and outside-click close it, and Escape returns focus
 * to the button. On success it closes and refreshes the route, the same way
 * logging out does; `api.login` has already published the session, so the
 * navbar flips to signed-in on its own.
 */
export function SignInPopover() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const titleId = React.useId();
  const descriptionId = React.useId();

  const handleSuccess = React.useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
        >
          Sign in
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="signin-glossy w-[22rem]"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="mb-4 flex flex-col gap-1">
          <h2
            id={titleId}
            className="font-display text-lg leading-tight text-foreground"
          >
            Welcome back
          </h2>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            Log in to your account.
          </p>
        </div>

        <LoginForm idPrefix="nav-signin-" onSuccess={handleSuccess} />
      </PopoverContent>
    </Popover>
  );
}
