"use client";

import type { ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field } from "@/features/auth/components/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ThumbnailPicker } from "./thumbnail-picker";
import {
  CREATABLE_TYPES,
  detailsSchema,
  titleFromFilename,
  type UploadDetails,
} from "../schemas";

/**
 * What the API needs to create the draft video: title, content type, and the
 * AI-generated declaration (spec 3.5). Genre and visibility are chosen when
 * publishing. `trailerSlot` is the optional trailer picker; it is hidden when
 * the content type is Trailer, because a trailer cannot have its own trailer.
 */
export function UploadDetailsForm({
  filename,
  initial,
  trailerSlot,
  onSubmit,
}: {
  filename: string;
  initial: UploadDetails | null;
  trailerSlot?: ReactNode;
  onSubmit: (details: UploadDetails) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<UploadDetails>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      title: initial?.title ?? titleFromFilename(filename),
      type: initial?.type,
      isAiGenerated: initial?.isAiGenerated ?? false,
      thumbnail: initial?.thumbnail ?? undefined,
    },
  });
  const selectedType = useWatch({ control, name: "type" });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <div role="group" aria-labelledby="upload-group-about" className="flex flex-col gap-4">
        <p
          id="upload-group-about"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          About this video
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id="upload-title"
              label="Title"
              maxLength={200}
              description="Up to 200 characters. Suggested from the file name; edit as needed."
              error={errors.title?.message}
              {...register("title")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="upload-type">Content type</Label>
            <Select
              id="upload-type"
              defaultValue={initial?.type ?? ""}
              aria-invalid={errors.type ? true : undefined}
              aria-describedby={errors.type ? "upload-type-error" : undefined}
              {...register("type")}
            >
              <option value="" disabled>
                Select a type
              </option>
              {CREATABLE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            {errors.type && (
              <p id="upload-type-error" className="text-xs text-destructive">
                {errors.type.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div
        role="group"
        aria-labelledby="upload-group-thumbnail"
        className="flex flex-col gap-4"
      >
        <p
          id="upload-group-thumbnail"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          Thumbnail &amp; declaration
        </p>

        <div className="sm:max-w-md">
          <Controller
            control={control}
            name="thumbnail"
            render={({ field }) => (
              <ThumbnailPicker
                value={field.value ?? null}
                onChange={field.onChange}
                error={errors.thumbnail?.message}
              />
            )}
          />
        </div>

        <div className="flex items-start gap-2">
          <input
            id="upload-ai"
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            aria-describedby="upload-ai-hint"
            {...register("isAiGenerated")}
          />
          <div>
            <Label htmlFor="upload-ai">This video is AI-generated</Label>
            <p id="upload-ai-hint" className="text-xs text-muted-foreground">
              Viewers see an AI label on videos with this declaration.
            </p>
          </div>
        </div>
      </div>

      {selectedType !== "TRAILER" && trailerSlot}

      <Button type="submit" className="self-start">
        Start upload
      </Button>
    </form>
  );
}
