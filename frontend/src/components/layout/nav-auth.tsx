"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SignInPopover } from "@/features/auth/components/sign-in-popover";
import { useRestoredSession } from "@/features/auth/hooks/use-restored-session";
import { api } from "@/lib/api/client";

/**
 * Sign-in area of the navbar. Visitors see "Sign in" (a popover anchored to
 * the button) and "Get started"; a signed-in user sees "Studio" and "Log out".
 * Logging out discards the access token, clears the refresh cookie, and drops
 * cached account data.
 */
export function NavAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useRestoredSession();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [logoutFailed, setLogoutFailed] = React.useState(false);

  async function logout() {
    setLoggingOut(true);
    setLogoutFailed(false);
    try {
      await api.logout();
    } catch {
      setLogoutFailed(true);
    } finally {
      queryClient.clear();
      setLoggingOut(false);
      router.refresh();
    }
  }

  if (session.status === "authenticated") {
    return (
      <>
        <Button variant="outline" size="sm" asChild>
          <Link href="/studio">Studio</Link>
        </Button>
        <Button size="sm" onClick={logout} disabled={loggingOut}>
          Log out
        </Button>
        {logoutFailed && (
          <span role="alert" className="sr-only">
            We couldn&apos;t finish logging out. Reload the page and try again.
          </span>
        )}
      </>
    );
  }

  return (
    <>
      <SignInPopover />
      <Button size="sm" asChild>
        <Link href="/signup">Get started</Link>
      </Button>
    </>
  );
}
