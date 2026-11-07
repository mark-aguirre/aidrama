"use client";

import * as React from "react";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type SessionSnapshot,
} from "@/lib/auth/session-store";

/** The in-memory session: status ("unknown" until restored) and the signed-in user. */
export function useSession(): SessionSnapshot {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
