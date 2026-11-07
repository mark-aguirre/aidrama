"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import "./sheet.css";

/**
 * Bottom sheet built on the Radix dialog primitive, so it inherits the focus
 * trap, Escape-to-close, scroll lock, and focus return to the trigger.
 */
const Sheet = Dialog;
const SheetTrigger = DialogTrigger;
const SheetClose = DialogClose;

/** Every sheet needs a `SheetTitle` (visually hidden is fine) to be named. */
const SheetTitle = DialogTitle;
const SheetDescription = DialogDescription;

const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "sheet-content fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <div
        aria-hidden="true"
        className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border"
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      <DialogPrimitive.Close
        aria-label="Close"
        className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-5" aria-hidden="true" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = "SheetContent";

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-4 pb-2 pt-3", className)} {...props} />;
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
