"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import "./popover.css";

/**
 * shadcn-style wrapper around Radix Popover: a non-modal surface anchored to
 * its trigger. Radix supplies the semantics: `role="dialog"` on the content,
 * aria-haspopup/expanded/controls on the trigger, focus moving into the
 * content on open, Escape and outside-click to close, and focus return to the
 * trigger on Escape. Give the content an accessible name with `aria-label` or
 * `aria-labelledby`.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(
  (
    { className, align = "center", sideOffset = 8, collisionPadding = 16, ...props },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "popover-content z-50 w-72 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl focus-visible:outline-none",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverContent, PopoverTrigger };
