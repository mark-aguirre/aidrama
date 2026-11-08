import { z } from "zod";
import type {
  AuthResponse,
  AuthUser,
  CompleteUploadResponse,
  ProcessingStatusResponse,
  UploadSession,
} from "@/types/domain";

/**
 * Runtime schemas for the API responses the client acts on (auth, uploads,
 * processing). Each is checked against the domain type with `satisfies`, so a
 * drift between schema and `domain.ts` fails type-checking.
 */

const failureSchema = z.object({ code: z.string(), message: z.string() });

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string(),
  roles: z.array(z.string()),
  emailVerified: z.boolean(),
  createdAt: z.string(),
}) satisfies z.ZodType<AuthUser>;

export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().positive(),
  user: authUserSchema,
}) satisfies z.ZodType<AuthResponse>;

/** What the browser receives from the Next.js auth route handlers. */
export const authSessionSchema = authResponseSchema.omit({
  refreshToken: true,
});

const processingStatusValues = [
  "PENDING",
  "UPLOADING",
  "PROCESSING",
  "READY",
  "FAILED",
] as const;

export const processingStatusSchema = z.object({
  videoId: z.string(),
  processingStatus: z.enum(processingStatusValues),
  publicationStatus: z.enum([
    "DRAFT",
    "PROCESSING",
    "READY",
    "PUBLISHED",
    "UNPUBLISHED",
    "FAILED",
    "REMOVED",
  ]),
  jobStatus: z.enum(["PENDING", "PROCESSING", "READY", "FAILED"]).nullable(),
  progressPercent: z.number(),
  failure: failureSchema.nullable(),
  updatedAt: z.string(),
}) satisfies z.ZodType<ProcessingStatusResponse>;

export const uploadSessionSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  status: z.enum([
    "PENDING",
    "UPLOADING",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
  ]),
  assetKind: z.enum(["VIDEO", "THUMBNAIL"]),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number(),
  uploadedBytes: z.number(),
  upload: z
    .object({
      url: z.string(),
      method: z.literal("PUT"),
      headers: z.record(z.string(), z.string()),
    })
    .nullable(),
  multipart: z
    .object({
      partSizeBytes: z.number(),
      totalParts: z.number(),
      parts: z.array(z.object({ partNumber: z.number(), url: z.string() })),
    })
    .nullable(),
  expiresAt: z.string(),
  completedAt: z.string().nullable(),
  failure: failureSchema.nullable(),
  createdAt: z.string(),
}) satisfies z.ZodType<UploadSession>;

export const completeUploadSchema = z.object({
  upload: uploadSessionSchema,
  processing: processingStatusSchema,
}) satisfies z.ZodType<CompleteUploadResponse>;
