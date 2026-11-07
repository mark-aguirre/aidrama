"use client";

import * as React from "react";
import { api } from "@/lib/api/client";
import type { SessionSnapshot } from "@/lib/auth/session-store";
import { useSession } from "./use-session";

export interface RestoredSession extends SessionSnapshot {
  /** True when restoring failed for a reason other than "not signed in" (network, server). */
  failed: boolean;
  retry: () => void;
}

/**
 * The session, restored once on mount. `status` stays "unknown" until the
 * restore settles; an anonymous visitor settles without any network request.
 */
export function useRestoredSession(): RestoredSession {
  const session = useSession();
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    api.restoreSession().then(
      () => active && setFailed(false),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { ...session, failed, retry };
}
