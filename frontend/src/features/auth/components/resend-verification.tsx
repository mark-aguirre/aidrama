"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";

/** Wait between resend requests. The API has no rate limit yet, so this is a client-side courtesy. */
const RESEND_COOLDOWN_SECONDS = 30;

type ResendState = "idle" | "sending" | "sent" | "already-verified" | "error";

/**
 * "Resend email" action with the states from the design: idle, sending,
 * sent (polite status), and a visible cooldown. Requires a signed-in session
 * (POST /auth/resend-verification is a bearer endpoint).
 */
export function ResendVerification({
  label = "Resend email",
}: {
  label?: string;
}) {
  const [state, setState] = React.useState<ResendState>("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = React.useState(0);

  React.useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  async function resend() {
    setState("sending");
    setMessage(null);
    try {
      await api.resendVerification();
      setState("sent");
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      if (isApiError(error, "EMAIL_ALREADY_VERIFIED")) {
        setState("already-verified");
        return;
      }
      setState("error");
      setMessage(
        errorMessage(error, "We couldn't send the email. Please try again."),
      );
    }
  }

  const sending = state === "sending";
  const coolingDown = secondsLeft > 0;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={resend}
        disabled={sending || coolingDown || state === "already-verified"}
        className="w-full"
      >
        {sending && <Loader2 className="animate-spin" aria-hidden="true" />}
        {label}
      </Button>

      {coolingDown && (
        <p className="text-center text-xs text-muted-foreground">
          You can resend in {secondsLeft}s.
        </p>
      )}

      <div role="status" className="text-center text-sm">
        {state === "sent" && (
          <span className="text-success">Sent. Check your inbox.</span>
        )}
        {state === "already-verified" && (
          <span className="text-success">Your email is already verified.</span>
        )}
      </div>
      {state === "error" && message && (
        <p role="alert" className="text-center text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  );
}
