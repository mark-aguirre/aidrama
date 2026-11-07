"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GENRES, api } from "@/lib/api/client";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { Video } from "@/types/domain";
import {
  VISIBILITY_CHOICES,
  publishSchema,
  type PublishValues,
} from "../schemas";

/**
 * Publish a READY video. The API needs a genre and a PUBLIC or UNLISTED
 * visibility (a new video is PRIVATE), so both are chosen explicitly here.
 */
export function PublishForm({
  videoId,
  idPrefix,
  onPublished,
}: {
  videoId: string;
  /** Keeps element ids unique when several forms exist on a page. */
  idPrefix: string;
  onPublished: (video: Video) => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PublishValues>({
    resolver: zodResolver(publishSchema),
    defaultValues: { genre: undefined, visibility: undefined },
  });
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(values: PublishValues) {
    setFormError(null);
    try {
      const video = await api.publishVideo(videoId, values);
      await queryClient.invalidateQueries({ queryKey: ["creator-videos"] });
      onPublished(video);
    } catch (error) {
      const code = isApiError(error) ? error.code : null;
      if (code === "GENRE_REQUIRED" || code === "VALIDATION_ERROR") {
        setError("genre", { message: errorMessage(error, "Select a genre.") });
      } else if (code === "VISIBILITY_REQUIRED") {
        setError("visibility", { message: errorMessage(error, "Select who can watch it.") });
      } else {
        setFormError(errorMessage(error, "We couldn't publish this video. Please try again."));
      }
    }
  }

  const genreId = `${idPrefix}-genre`;
  const visibilityId = `${idPrefix}-visibility`;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-4"
      aria-label="Publish video"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={genreId}>Genre</Label>
          <Select
            id={genreId}
            defaultValue=""
            aria-invalid={errors.genre ? true : undefined}
            aria-describedby={errors.genre ? `${genreId}-error` : undefined}
            {...register("genre")}
          >
            <option value="" disabled>
              Select a genre
            </option>
            {GENRES.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </Select>
          {errors.genre && (
            <p id={`${genreId}-error`} className="text-xs text-destructive">
              {errors.genre.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={visibilityId}>Who can watch</Label>
          <Select
            id={visibilityId}
            defaultValue=""
            aria-invalid={errors.visibility ? true : undefined}
            aria-describedby={errors.visibility ? `${visibilityId}-error` : undefined}
            {...register("visibility")}
          >
            <option value="" disabled>
              Select visibility
            </option>
            {VISIBILITY_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </Select>
          {errors.visibility && (
            <p id={`${visibilityId}-error`} className="text-xs text-destructive">
              {errors.visibility.message}
            </p>
          )}
        </div>
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
        Publish
      </Button>
    </form>
  );
}
