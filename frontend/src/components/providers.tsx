"use client";

import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { SignInProvider } from "@/features/auth/components/sign-in-provider";

/**
 * App-wide client providers. TanStack Query manages server-state (spec 14);
 * SignInProvider hosts the shared inline sign-in panel.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SignInProvider>{children}</SignInProvider>
    </QueryClientProvider>
  );
}
