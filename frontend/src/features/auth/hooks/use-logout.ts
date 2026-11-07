"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export interface Logout {
  /** Resolves true when the API call succeeded. The local session is cleared either way. */
  logout: () => Promise<boolean>;
  pending: boolean;
  failed: boolean;
}

/**
 * Logs the user out: discards the access token, clears the refresh cookie via
 * the API, drops cached account data, and refreshes server components. Same
 * sequence as the desktop `NavAuth`.
 */
export function useLogout(): Logout {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const logout = React.useCallback(async () => {
    setPending(true);
    setFailed(false);
    let ok = true;
    try {
      await api.logout();
    } catch {
      ok = false;
      setFailed(true);
    } finally {
      queryClient.clear();
      setPending(false);
      router.refresh();
    }
    return ok;
  }, [queryClient, router]);

  return { logout, pending, failed };
}
