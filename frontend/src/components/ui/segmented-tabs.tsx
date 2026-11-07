"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedTab<T extends string> {
  value: T;
  label: string;
}

/** DOM id of one tab; use it as `aria-labelledby` on the controlled panel. */
export function segmentedTabId(idBase: string, value: string): string {
  return `${idBase}-tab-${value}`;
}

/** DOM id the tabs point at with `aria-controls`; put it on the controlled panel. */
export function segmentedPanelId(idBase: string): string {
  return `${idBase}-panel`;
}

interface SegmentedTabsProps<T extends string> {
  tabs: ReadonlyArray<SegmentedTab<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /** Unique per instance; derives the tab and panel ids. */
  idBase: string;
  "aria-label": string;
  className?: string;
}

/**
 * Pill-style tab group. Tabs wrap onto extra lines instead of scrolling.
 * Roving tabindex with automatic activation: Left/Right move and select,
 * Home/End jump to the first/last tab.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  idBase,
  "aria-label": ariaLabel,
  className,
}: SegmentedTabsProps<T>) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((tab) => tab.value === value);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (current + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onValueChange(tabs[next].value);
    event.currentTarget
      .querySelector<HTMLElement>(`[id="${segmentedTabId(idBase, tabs[next].value)}"]`)
      ?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1", className)}
    >
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={segmentedTabId(idBase, tab.value)}
            aria-selected={selected}
            aria-controls={segmentedPanelId(idBase)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-background text-foreground shadow-[inset_0_-2px_0_0_var(--primary)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
