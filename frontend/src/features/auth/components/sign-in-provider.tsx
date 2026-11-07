"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SignInDropdown } from "./sign-in-dropdown";

export interface OpenSignInOptions {
  /**
   * Where focus goes when the panel closes without a successful login.
   * Defaults to the element that was focused when the panel opened; pass it
   * when that element is about to unmount (for example a row inside a sheet).
   */
  returnFocusTo?: HTMLElement | null;
  /** Runs once after a successful login, never when the panel is dismissed. */
  onSuccess?: () => void;
}

interface SignInControls {
  open: (options?: OpenSignInOptions) => void;
}

const SignInContext = React.createContext<SignInControls | null>(null);

/**
 * Owns the shared sign-in panel (bottom sheet on phones, card from `sm` up)
 * that the mobile header, menu sheet, tab bar and Like button open in place.
 * The desktop navbar has its own anchored `SignInPopover`. On success it closes the panel and refreshes the route
 * (`api.login` has already published the session, so session-driven UI such as
 * the navbar flips to signed-in on its own), then runs the caller's `onSuccess`.
 */
export function SignInProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const onSuccessRef = React.useRef<(() => void) | undefined>(undefined);

  const open = React.useCallback((options: OpenSignInOptions = {}) => {
    const active = document.activeElement;
    returnFocusRef.current =
      options.returnFocusTo ?? (active instanceof HTMLElement ? active : null);
    onSuccessRef.current = options.onSuccess;
    setIsOpen(true);
  }, []);

  const handleOpenChange = React.useCallback((next: boolean) => {
    setIsOpen(next);
    if (!next) onSuccessRef.current = undefined;
  }, []);

  const handleSuccess = React.useCallback(() => {
    const callback = onSuccessRef.current;
    onSuccessRef.current = undefined;
    setIsOpen(false);
    router.refresh();
    callback?.();
  }, [router]);

  // Radix only restores focus to a <Trigger>, and this panel has none.
  const handleCloseAutoFocus = React.useCallback((event: Event) => {
    event.preventDefault();
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected) target.focus();
  }, []);

  const controls = React.useMemo<SignInControls>(() => ({ open }), [open]);

  return (
    <SignInContext.Provider value={controls}>
      {children}
      <SignInDropdown
        open={isOpen}
        onOpenChange={handleOpenChange}
        onSuccess={handleSuccess}
        onCloseAutoFocus={handleCloseAutoFocus}
      />
    </SignInContext.Provider>
  );
}

/** Opens the shared sign-in panel. Must be used under `SignInProvider`. */
export function useSignIn(): SignInControls {
  const controls = React.useContext(SignInContext);
  if (!controls) {
    throw new Error("useSignIn must be used within a SignInProvider.");
  }
  return controls;
}
