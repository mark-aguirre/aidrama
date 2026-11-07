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
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFile(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-media border-2 border-dashed border-border px-4 py-14 text-center transition-colors motion-reduce:transition-none sm:py-16",
        invalid && "border-destructive/50",
        dragging && "border-primary bg-accent/50",
        className,
      )}
    >
      <UploadCloud
        className={cn("size-8", dragging ? "text-primary" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <p className={cn("text-sm", dragging ? "text-primary" : "text-foreground")}>
        {dragging ? "Drop to upload" : prompt}
      </p>
      <p className="text-xs text-muted-foreground">MP4, MOV, or WebM. Up to 2 GB.</p>
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
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
