import { z } from "zod";

/**
 * Validation schemas for the auth forms (spec 3.1). Limits mirror
 * API-CONTRACT.md ("Field rules"); the API remains the authority.
 */

const MAX_PASSWORD_BYTES = 72;

const emailField = z
  .string()
  .min(1, "Email is required.")
  .max(254, "Email must be 254 characters or fewer.")
  .email("Enter a valid email.");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required."),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name is required.")
      .max(50, "Display name must be 50 characters or fewer."),
    username: z
      .string()
      .regex(
        /^[a-z0-9_]{3,30}$/,
        "Use 3 to 30 lowercase letters, numbers, or underscores.",
      ),
    email: emailField,
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(72, "Password must be 72 characters or fewer.")
      .refine(
        (value) => new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES,
        "Password is too long. Use fewer special characters.",
      ),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type RegisterValues = z.infer<typeof registerSchema>;

/** Form fields the API can report errors for (details[].field). */
export const REGISTER_FIELDS = [
  "displayName",
  "username",
  "email",
  "password",
] as const;
export type RegisterField = (typeof REGISTER_FIELDS)[number];

export const PASSWORD_HINT = "Use 8 to 72 characters.";
