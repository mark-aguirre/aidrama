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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-7">
      <p className="text-xs text-muted-foreground">
        Title, content type, and thumbnail are required.
      </p>

      <div role="group" aria-labelledby="upload-group-about" className="flex flex-col gap-4">
        <h3 id="upload-group-about" className="text-sm font-semibold text-foreground">
          Video details
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              id="upload-title"
              label="Title"
              maxLength={200}
              required
              aria-required="true"
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
              required
              aria-required="true"
              aria-invalid={errors.type ? true : undefined}
              aria-describedby={errors.type ? "upload-type-error" : undefined}
              {...register("type")}
            >
              <option value="" disabled>
                Select a type
              </option>
              {CREATABLE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
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
        className="flex flex-col gap-4 border-t border-border/70 pt-6"
      >
        <h3 id="upload-group-thumbnail" className="text-sm font-semibold text-foreground">
          Thumbnail and AI disclosure
        </h3>

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

        <div className="flex items-start gap-3 rounded-media border border-border/70 bg-surface-2/40 p-4">
          <input
            id="upload-ai"
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            aria-describedby="upload-ai-hint"
            {...register("isAiGenerated")}
          />
          <div>
            <Label htmlFor="upload-ai">This video is AI-generated</Label>
            <p id="upload-ai-hint" className="mt-1 text-xs leading-5 text-muted-foreground">
              Viewers see an AI label on videos with this disclosure.
            </p>
          </div>
        </div>
      </div>

      {selectedType !== "TRAILER" && trailerSlot}

      <Button type="submit" className="w-full sm:w-auto sm:self-start">
        Start upload
      </Button>
    </form>
  );
}
