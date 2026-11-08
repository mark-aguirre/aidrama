"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SignInDropdown, type AuthMode } from "./sign-in-dropdown";

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

interface AuthControls {
  open: (options?: OpenSignInOptions) => void;
}

const SignInContext = React.createContext<AuthControls | null>(null);
const SignUpContext = React.createContext<AuthControls | null>(null);

/**
 * Owns the shared auth panel (bottom sheet on phones, card from `sm` up) that
 * hosts both the sign-in and sign-up forms. The mobile header, menu sheet, tab
 * bar, Studio gate and Like button open it in place through `useSignIn` /
 * `useSignUp`; the "Log in" / "Create an account" links inside the forms flip
 * the panel between the two modes. The desktop navbar has its own anchored
 * `SignInPopover` / `SignUpPopover`.
 *
 * On a successful login it closes the panel and refreshes the route
 * (`api.login` has already published the session, so session-driven UI such as
 * the navbar flips to signed-in on its own), then runs the caller's
 * `onSuccess`.
 */
export function SignInProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [mode, setMode] = React.useState<AuthMode>("sign-in");
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const onSuccessRef = React.useRef<(() => void) | undefined>(undefined);

  const openWithMode = React.useCallback(
    (nextMode: AuthMode, options: OpenSignInOptions = {}) => {
      const active = document.activeElement;
      returnFocusRef.current =
        options.returnFocusTo ??
        (active instanceof HTMLElement ? active : null);
      onSuccessRef.current = options.onSuccess;
      setMode(nextMode);
      setIsOpen(true);
    },
    [],
  );

  const openSignIn = React.useCallback(
    (options?: OpenSignInOptions) => openWithMode("sign-in", options),
    [openWithMode],
  );
  const openSignUp = React.useCallback(
    (options?: OpenSignInOptions) => openWithMode("sign-up", options),
    [openWithMode],
  );

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

  const signInControls = React.useMemo<AuthControls>(
    () => ({ open: openSignIn }),
    [openSignIn],
  );
  const signUpControls = React.useMemo<AuthControls>(
    () => ({ open: openSignUp }),
    [openSignUp],
  );

  return (
    <SignInContext.Provider value={signInControls}>
      <SignUpContext.Provider value={signUpControls}>
        {children}
        <SignInDropdown
          open={isOpen}
          mode={mode}
          onOpenChange={handleOpenChange}
          onModeChange={setMode}
          onSuccess={handleSuccess}
          onCloseAutoFocus={handleCloseAutoFocus}
        />
      </SignUpContext.Provider>
    </SignInContext.Provider>
  );
}

/** Opens the shared panel on the sign-in form. Must be used under `SignInProvider`. */
export function useSignIn(): AuthControls {
  const controls = React.useContext(SignInContext);
  if (!controls) {
    throw new Error("useSignIn must be used within a SignInProvider.");
  }
  return controls;
}

/** Opens the shared panel on the sign-up form. Must be used under `SignInProvider`. */
export function useSignUp(): AuthControls {
  const controls = React.useContext(SignUpContext);
  if (!controls) {
    throw new Error("useSignUp must be used within a SignInProvider.");
  }
  return controls;
}
