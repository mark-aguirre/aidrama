import * as React from "react";
import { AlertCircle, EllipsisVertical, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Video } from "@/types/domain";

/** Marks a menu item whose backend endpoint does not exist yet. */
function ComingSoon() {
  return <span className="ml-auto pl-4 text-xs text-muted-foreground">Coming soon</span>;
}

/**
 * Overflow (⋯) menu for one content row. Presentation only: the row owns the
 * state behind each callback. Edit, Change visibility and Unpublish have no
 * API yet, so they are shown disabled as signposts.
 */
export function ContentRowMenu({
  video,
  triggerRef,
  triggerClassName,
  onViewReason,
  onDelete,
  onCloseAutoFocus,
}: {
  video: Video;
  triggerRef: React.Ref<HTMLButtonElement>;
  /** Lets the row position the trigger inside its own grid. */
  triggerClassName?: string;
  onViewReason: () => void;
  onDelete: () => void;
  /** Lets the row send focus into an opened panel instead of back to the trigger. */
  onCloseAutoFocus: (event: Event) => void;
}) {
  const failed = video.processingStatus === "FAILED";
  const published = video.publicationStatus === "PUBLISHED";
  const unpublished = video.publicationStatus === "UNPUBLISHED";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          className={triggerClassName}
          aria-label={`More actions for ${video.title}`}
        >
          <EllipsisVertical aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
        {failed && (
          <DropdownMenuItem onSelect={onViewReason}>
            <AlertCircle aria-hidden="true" />
            View failure reason
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled title="Editing is coming soon">
          <Pencil aria-hidden="true" />
          Edit details
          <ComingSoon />
        </DropdownMenuItem>
        {(published || unpublished) && (
          <DropdownMenuItem disabled title="Changing visibility is coming soon">
            <Eye aria-hidden="true" />
            Change visibility
            <ComingSoon />
          </DropdownMenuItem>
        )}
        {published && (
          <DropdownMenuItem disabled title="Unpublishing is coming soon">
            <EyeOff aria-hidden="true" />
            Unpublish
            <ComingSoon />
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-destructive data-[highlighted]:text-destructive"
        >
          <Trash2 aria-hidden="true" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
