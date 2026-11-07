"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { errorMessage, isApiError, type ApiError } from "@/lib/api/errors";
import { Field } from "./field";
import {
  PASSWORD_HINT,
  REGISTER_FIELDS,
  registerSchema,
  type RegisterField,
  type RegisterValues,
} from "../schemas";

const FIELD_LABELS: Record<RegisterField, string> = {
  displayName: "Display name",
  username: "Username",
  email: "Email",
  password: "Password",
};

function isRegisterField(field: string): field is RegisterField {
  return (REGISTER_FIELDS as readonly string[]).includes(field);
}

export function RegisterForm({
  onRegistered,
}: {
  /** Called with the address the account was created for. */
  onRegistered: (email: string) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  const [formError, setFormError] = React.useState<string | null>(null);
  const [emailTaken, setEmailTaken] = React.useState(false);

  /** Put API field issues on their inputs; returns true when every issue was placed. */
  function applyFieldIssues(error: ApiError): boolean {
    let placedAll = error.details.length > 0;
    for (const detail of error.details) {
      if (!isRegisterField(detail.field)) {
        placedAll = false;
        continue;
      }
      if (error.code === "DUPLICATE_RESOURCE" && detail.field === "email") {
        setEmailTaken(true);
        setError("email", { message: "This email is already registered." });
      } else if (error.code === "DUPLICATE_RESOURCE" && detail.field === "username") {
        setError("username", { message: "This username is taken." });
      } else {
        setError(detail.field, {
          message: `${FIELD_LABELS[detail.field]} ${detail.issue}.`,
        });
      }
    }
    return placedAll;
  }

  async function onSubmit(values: RegisterValues) {
    setFormError(null);
    setEmailTaken(false);
    // confirmPassword is a client-side check only and is never sent.
    const { displayName, username, email, password } = values;
    try {
      await api.register({ displayName, username, email, password });
      onRegistered(email);
    } catch (error) {
      if (
        isApiError(error) &&
        (error.code === "VALIDATION_ERROR" || error.code === "DUPLICATE_RESOURCE") &&
        applyFieldIssues(error)
      ) {
        return;
      }
      setFormError(
        errorMessage(error, "We couldn't create your account. Please try again."),
      );
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Field
        id="displayName"
        label="Display name"
        autoComplete="name"
        error={errors.displayName?.message}
        {...register("displayName")}
      />
      <Field
        id="username"
        label="Username"
        autoComplete="username"
        description="Lowercase letters, numbers, and underscores."
        error={errors.username?.message}
        {...register("username")}
      />
      <Field
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        errorAction={
          emailTaken ? (
            <Link href="/login" className="text-primary hover:underline">
              Log in instead
            </Link>
          ) : undefined
        }
        {...register("email")}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        description={PASSWORD_HINT}
        error={errors.password?.message}
        {...register("password")}
      />
      <Field
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        Create account
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
