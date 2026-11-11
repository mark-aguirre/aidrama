"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Drag past this share of the sheet's height to dismiss. */
const DISMISS_DISTANCE_RATIO = 0.3;
/** A quick downward flick (px per ms) dismisses after a short drag. */
const DISMISS_VELOCITY = 0.5;
const DISMISS_MIN_FLICK_PX = 24;
const SNAP_BACK_MS = 220;
const DISMISS_MS = 180;

interface DragState {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  offset: number;
}

/**
 * Drag handle that lets a bottom sheet be swiped down to dismiss. The sheet
 * follows the finger, snaps back below the threshold, and slides away above
 * it. Keyboard and screen-reader users are unaffected: the handle is
 * decorative (`aria-hidden`) and Escape, the Close button and the overlay
 * still dismiss through the dialog.
 *
 * `targetRef` is the sheet surface to move. `onDismiss` must close the dialog
 * (the sheets pass a click on their own Close button, so Radix handles focus
 * return and state). Only the strip captures the gesture (`touch-none`); the
 * sheet body keeps native scrolling.
 */
export function SheetGrabber({
  targetRef,
  onDismiss,
  className,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  onDismiss: () => void;
  className?: string;
}) {
  const drag = React.useRef<DragState | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = targetRef.current;
    if (!target || drag.current || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      offset: 0,
    };
    target.style.transition = "none";
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const target = targetRef.current;
    if (!state || !target || state.pointerId !== event.pointerId) return;

    const elapsed = event.timeStamp - state.lastTime;
    if (elapsed > 0) state.velocity = (event.clientY - state.lastY) / elapsed;
    state.lastY = event.clientY;
    state.lastTime = event.timeStamp;

    // Only downward movement; dragging up stays put rather than stretching.
    state.offset = Math.max(0, event.clientY - state.startY);
    target.style.transform = `translateY(${state.offset}px)`;
  }

  function finish(event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const state = drag.current;
    const target = targetRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!target) return;

    const farEnough = state.offset > target.offsetHeight * DISMISS_DISTANCE_RATIO;
    const flicked =
      state.velocity > DISMISS_VELOCITY && state.offset > DISMISS_MIN_FLICK_PX;

    if (!cancelled && (farEnough || flicked)) {
      // Slide the rest of the way out, then close. `data-swipe-dismissed`
      // turns off the dialog's own exit animation (sheet.css) so it doesn't
      // jump back to the top and replay.
      target.dataset.swipeDismissed = "true";
      target.style.transition = `transform ${DISMISS_MS}ms var(--ease-depart)`;
      target.style.transform = "translateY(100%)";
      timer.current = window.setTimeout(onDismiss, DISMISS_MS);
      return;
    }

    target.style.transition = `transform ${SNAP_BACK_MS}ms var(--ease-arrive)`;
    target.style.transform = "";
    timer.current = window.setTimeout(() => {
      target.style.transition = "";
    }, SNAP_BACK_MS);
  }

  return (
    <div
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
      className={cn(
        "relative z-10 mx-auto flex h-7 w-full shrink-0 cursor-grab touch-none select-none justify-center pt-2 active:cursor-grabbing",
        className,
      )}
    >
      <span className="h-1 w-10 rounded-full bg-border" />
    </div>
  );
}
