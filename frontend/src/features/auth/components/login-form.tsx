"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { Field } from "./field";
import { loginSchema, type LoginValues } from "../schemas";

export interface LoginFormProps {
  /**
   * Inline use: called after a successful login instead of redirecting, so the
   * host surface (for example the sign-in dropdown) decides what happens next.
   * Omit it on the /login page to redirect to the `?next=` path.
   */
  onSuccess?: () => void;
  /** Called when the "Create an account" link is followed, so an inline host can close. */
  onNavigate?: () => void;
  /** Prefix for field ids, so two login forms on one page never share ids. */
  idPrefix?: string;
}

interface LoginFormBodyProps {
  onSuccess: () => void;
  onNavigate?: () => void;
  idPrefix: string;
}

function LoginFormBody({ onSuccess, onNavigate, idPrefix }: LoginFormBodyProps) {
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

      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href="/signup"
          onClick={onNavigate}
          className="text-primary hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}

/** Reads `?next=` and redirects there after login. Needs a Suspense boundary. */
function RedirectingLoginForm({ onNavigate, idPrefix }: Omit<LoginFormBodyProps, "onSuccess">) {
  const router = useRouter();
  const next = useSearchParams().get("next");

  const redirect = React.useCallback(
    () => router.replace(safeRedirectPath(next)),
    [router, next],
  );

  return (
    <LoginFormBody onSuccess={redirect} onNavigate={onNavigate} idPrefix={idPrefix} />
  );
}

/**
 * Email and password login. Without `onSuccess` it is the /login page form and
 * redirects to a safe `?next=` path. With `onSuccess` it runs inline and never
 * reads the URL, so it needs no Suspense boundary.
 */
export function LoginForm({ onSuccess, onNavigate, idPrefix = "" }: LoginFormProps) {
  if (onSuccess) {
    return (
      <LoginFormBody onSuccess={onSuccess} onNavigate={onNavigate} idPrefix={idPrefix} />
    );
  }
  return <RedirectingLoginForm onNavigate={onNavigate} idPrefix={idPrefix} />;
}
