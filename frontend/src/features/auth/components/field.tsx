import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

/**
 * Accessible labelled input with helper text and inline error text (skill
 * sections 8, 13). Helper text and the error are linked to the control via
 * aria-describedby, and aria-invalid marks the error state. `errorAction`
 * renders a follow-up link beside the error (for example "Log in").
 */
export const Field = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    id: string;
    label: string;
    error?: string;
    description?: string;
    errorAction?: React.ReactNode;
  }
>(({ id, label, error, description, errorAction, ...props }, ref) => {
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {description && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error} {errorAction}
        </p>
      )}
    </div>
  );
});
Field.displayName = "Field";
