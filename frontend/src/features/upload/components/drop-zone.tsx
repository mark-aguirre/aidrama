"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE } from "../schemas";

/**
 * Drag-and-drop target with a keyboard-operable "Choose file" button. `invalid`
 * only tints the border while the parent shows a rejected-file message; the
 * message itself carries the meaning. The copy props default to the main-video
 * wording; the trailer picker overrides them so each target is named.
 */
export function DropZone({
  onFile,
  invalid = false,
  prompt = "Drag and drop a video, or choose a file.",
  actionLabel = "Choose file",
  inputLabel = "Video file",
  className,
}: {
  onFile: (file: File | undefined) => void;
  invalid?: boolean;
  prompt?: string;
  actionLabel?: string;
  inputLabel?: string;
  className?: string;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFile(event.dataTransfer.files[0]);
      }}
      className={cn(
        "group flex flex-col items-center justify-center gap-3 rounded-media border-2 border-dashed border-border bg-surface-2/30 px-6 py-12 text-center transition-colors hover:border-primary/50 focus-within:border-primary/60 motion-reduce:transition-none sm:py-16",
        invalid && "border-destructive/60",
        dragging && "border-primary bg-primary/5",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-full bg-accent text-muted-foreground transition-colors motion-reduce:transition-none",
          dragging
            ? "bg-primary/15 text-primary"
            : "group-hover:bg-primary/10 group-hover:text-primary",
        )}
        aria-hidden="true"
      >
        <UploadCloud className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className={cn("text-sm font-medium", dragging ? "text-primary" : "text-foreground")}>
          {dragging ? "Drop to upload" : prompt}
        </p>
        <p className="text-xs text-muted-foreground">MP4, MOV, or WebM, up to 2 GB</p>
      </div>
      <Button type="button" onClick={() => inputRef.current?.click()}>
        {actionLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label={inputLabel}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
