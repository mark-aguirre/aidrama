"use client";

import * as React from "react";
import Image from "next/image";
import { Globe, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { THUMBNAIL_ACCEPT_ATTRIBUTE } from "../schemas";
import { compressThumbnail, formatBytes } from "../thumbnail-compress";
import { ThumbnailSearchDialog } from "./thumbnail-search-dialog";

/**
 * Required thumbnail picker for the upload form. Shows a 16:9 drop target until
 * an image is chosen, then a preview with a button to replace or remove it.
 * The selected `File` is owned by the parent form; this component only reports
 * changes through `onChange` and renders whatever the parent passes in `value`.
 *
 * Every picked image (from disk, from a drop, or from the search dialog) is
 * scaled down and re-encoded before it is reported, so the upload carries a few
 * hundred kilobytes instead of a full-size photo. The compression step never
 * blocks a pick: if it cannot run, the original file is reported instead.
 */
export function ThumbnailPicker({
  value,
  onChange,
  error,
  id = "upload-thumbnail",
}: {
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  id?: string;
}) {
  const [dragging, setDragging] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // Identifies the newest pick, so a slow encode cannot overwrite a later one.
  const pickRef = React.useRef(0);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const statusId = `${id}-status`;

  // Derive the preview URL from the file and revoke the previous one so no blob
  // URL leaks. useMemo (not an effect) keeps the URL in sync with the file
  // without a cascading render.
  const preview = React.useMemo(
    () => (value ? URL.createObjectURL(value) : null),
    [value],
  );
  React.useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  /** Compress the picked image, then report it to the form. */
  const applyFile = React.useCallback(
    async (file: File | null) => {
      const pick = ++pickRef.current;
      setNote(null);
      if (!file) {
        setPreparing(false);
        onChange(null);
        return;
      }

      setPreparing(true);
      const prepared = await compressThumbnail(file);
      if (pickRef.current !== pick) return; // Superseded by a newer pick.

      setPreparing(false);
      setNote(
        prepared.compressed
          ? `Reduced from ${formatBytes(prepared.originalBytes)} to ${formatBytes(prepared.file.size)}.`
          : null,
      );
      onChange(prepared.file);
    },
    [onChange],
  );

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="flex flex-col gap-1.5" aria-busy={preparing || undefined}>
      <Label htmlFor={id}>
        Thumbnail <span className="text-destructive">*</span>
      </Label>

      {preview ? (
        <div className="relative overflow-hidden rounded-media border border-border bg-surface">
          <div className="relative aspect-video w-full">
            <Image
              src={preview}
              alt="Selected thumbnail preview"
              fill
              sizes="(max-width: 640px) 100vw, 480px"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            <p className="truncate text-xs text-muted-foreground" title={value?.name}>
              {value?.name}
            </p>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={openPicker}
                disabled={preparing}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Search from internet"
                title="Search from internet"
                onClick={() => setSearchOpen(true)}
                disabled={preparing}
              >
                <Globe aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove thumbnail"
                disabled={preparing}
                onClick={() => {
                  void applyFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (preparing) return;
            void applyFile(e.dataTransfer.files[0] ?? null);
          }}
          className={cn(
            "flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-media border-2 border-dashed border-border text-center transition-colors",
            dragging && "border-primary bg-accent/50",
            error && "border-destructive",
          )}
        >
          <ImagePlus className="text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            Drag and drop an image, choose one, or search the internet.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={openPicker}
              disabled={preparing}
            >
              Choose image
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSearchOpen(true)}
              disabled={preparing}
            >
              <Globe aria-hidden="true" />
              Search from internet
            </Button>
          </div>
        </div>
      )}

      <p id={hintId} className="text-xs text-muted-foreground">
        JPG, PNG, or WebP. Large images are resized for you. A 16:9 image looks
        best.
      </p>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={THUMBNAIL_ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        disabled={preparing}
        onChange={(e) => {
          void applyFile(e.target.files?.[0] ?? null);
        }}
      />

      {(preparing || note) && (
        <p
          id={statusId}
          role="status"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          {preparing ? (
            <>
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Preparing image
            </>
          ) : (
            note
          )}
        </p>
      )}

      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}

      <ThumbnailSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onPicked={(file) => {
          // A searched image replaces any file chosen from disk; clear the
          // native input so its value doesn't linger behind the new file.
          if (inputRef.current) inputRef.current.value = "";
          void applyFile(file);
        }}
      />
    </div>
  );
}
