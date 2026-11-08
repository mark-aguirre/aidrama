"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { Field } from "./field";
import { loginSchema, type LoginValues } from "../schemas";

export interface LoginFormProps {
  /**
   * Called after a successful login, so the host surface (the sign-in popover
   * or the shared dropdown) decides what happens next.
   */
  onSuccess: () => void;
  /**
   * Switches the shared auth panel to the sign-up form. When set, the form
   * shows a "Create an account" button beneath the submit button.
   */
  onSwitchToSignUp?: () => void;
  /** Prefix for field ids, so two login forms on one page never share ids. */
  idPrefix?: string;
}

/**
 * Email and password login, used inline inside the sign-in popover and the
 * shared auth dropdown. On success it calls `onSuccess`; the host closes the
 * panel and refreshes.
 */
export function LoginForm({ onSuccess, onSwitchToSignUp, idPrefix = "" }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const [formError, setFormError] = React.useState<string | null>(null);
  const [completed, setCompleted] = React.useState(false);

  async function onSubmit(values: LoginValues) {
    setFormError(null);
    try {
      await api.login(values);
      setCompleted(true);
      onSuccess();
    } catch (error) {
      setFormError(
        errorMessage(error, "We couldn't log you in. Please try again."),
      );
    }
  }

  const busy = isSubmitting || completed;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field
        id={`${idPrefix}email`}
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Field
        id={`${idPrefix}password`}
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
        Log in
      </Button>

      {onSwitchToSignUp && (
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="text-primary hover:underline"
          >
            Create an account
          </button>
        </p>
      )}
    </form>
  );
}
