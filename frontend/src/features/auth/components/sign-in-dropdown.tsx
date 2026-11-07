"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/dialog";
import "@/components/ui/sheet.css";
import "./sign-in-dropdown.css";
import "./sign-in-glossy.css";
import { LoginForm } from "./login-form";

export interface SignInDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after a successful login; the host closes the panel and refreshes. */
  onSuccess: () => void;
  /** Radix focus-return hook; the host moves focus back to the control that opened the panel. */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * The login form in place: a dropdown card under the navbar from `sm` up and a
 * bottom sheet on phones. Built on the app's Radix dialog primitive (there is
 * no popover primitive), so it keeps the focus trap, Escape and outside-click
 * to close, scroll lock, and the `dialog` role with its title and description.
 * Focus lands on the first form field when it opens.
 *
 * It is controlled and has no trigger of its own: the "Sign in" controls in
 * the mobile header, the mobile menu sheet and the tab bar, and the watch
 * page's Like button, open this single instance through `useSignIn`. The
 * desktop navbar uses `SignInPopover` instead.
 */
export function SignInDropdown({
  open,
  onOpenChange,
  onSuccess,
  onCloseAutoFocus,
}: SignInDropdownProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogOverlay className="bg-black/60 sm:bg-transparent sm:backdrop-blur-none" />
        <DialogPrimitive.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className="signin-panel signin-glossy fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-popover p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-popover-foreground focus-visible:outline-none sm:inset-x-auto sm:bottom-auto sm:right-[max(2rem,calc((100vw-1400px)/2+2rem))] sm:top-[4.25rem] sm:max-h-[calc(100dvh-5.5rem)] sm:w-[22rem] sm:rounded-lg sm:border sm:shadow-xl"
        >
          <div className="mb-4 flex flex-col gap-1">
            <DialogTitle>Welcome back</DialogTitle>
            <DialogDescription>Log in to your account.</DialogDescription>
          </div>

          <LoginForm
            idPrefix="signin-"
            onSuccess={onSuccess}
            onNavigate={() => onOpenChange(false)}
          />

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
