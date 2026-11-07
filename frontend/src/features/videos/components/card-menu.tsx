"use client";

import Link from "next/link";
import { EllipsisVertical, Play, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useShareLink } from "@/features/watch/components/share-button";

/**
 * Overflow (⋮) menu on a public card (video or series). Only actions that
 * work today: open the page, and share its link (native share sheet or copy).
 * It sits above the card's stretched link, so it needs `relative z-10`.
 */
export function CardMenu({
  title,
  href,
  openLabel,
  className,
}: {
  title: string;
  href: string;
  openLabel: string;
  className?: string;
}) {
  const { share, toast } = useShareLink({ title, path: href });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`More actions for ${title}`}
            className={cn(
              "relative z-10 size-8 shrink-0 text-muted-foreground hover:text-foreground",
              className,
            )}
          >
            <EllipsisVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          <DropdownMenuItem asChild>
            <Link href={href}>
              <Play aria-hidden="true" />
              {openLabel}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void share()}>
            <Share2 aria-hidden="true" />
            Share
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {toast}
    </>
  );
}
