"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown, LayoutGrid, List, type LucideIcon } from "lucide-react";
import { GENRES } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { GENRE_ICONS } from "../genre-icons";

const SORTS = [
  { key: "popular", label: "Most viewed" },
  { key: "recent", label: "Recently published" },
  { key: "liked", label: "Most liked" },
] as const;

const VIEWS = [
  { key: "grid", label: "Grid view", icon: LayoutGrid },
  { key: "list", label: "List view", icon: List },
] as const;

/**
 * Genre, sort, and layout controls for discovery pages (spec 3.13).
 * State lives in the URL so results are shareable and survive navigation
 * (frontend-engineer skill, section 9). Grid is the default layout, so only
 * `view=list` is ever written. Pass `sortable={false}` where the API has no
 * sort for the listing (GET /series is always newest first).
 *
 * Below `lg` the sort row is one compact line: the "Sort by" label is
 * screen-reader only and the controls are 44px. The grid/list toggle stays
 * reachable on mobile so a visitor on a shared `?view=list` URL can always
 * switch back to the grid.
 */
export function FilterBar({ sortable = true }: { sortable?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeGenre = params.get("genre") ?? "";
  const activeSort = params.get("sort") ?? "popular";
  const activeView = params.get("view") === "list" ? "list" : "grid";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="mb-8 flex flex-col gap-5 max-lg:mb-4 max-lg:gap-3">
      {/* On mobile the pills are one horizontal scroll row so they don't eat
          the screen; from sm up they wrap onto new lines as before. */}
      <div
        role="group"
        aria-label="Filter by genre"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
      >
        <GenrePill
          label="All"
          active={activeGenre === ""}
          onClick={() => setParam("genre", "")}
        />
        {GENRES.map((g) => (
          <GenrePill
            key={g}
            label={g}
            icon={GENRE_ICONS[g]}
            active={activeGenre === g}
            onClick={() => setParam("genre", g)}
          />
        ))}
      </div>

      <div className="flex items-center gap-4">
        {sortable && (
        <div className="flex items-center gap-3">
          <label
            htmlFor="sort"
            className="text-sm text-muted-foreground max-lg:sr-only"
          >
            Sort by
          </label>
          <div className="relative">
            <select
              id="sort"
              value={activeSort}
              onChange={(e) => setParam("sort", e.target.value)}
              className="h-11 w-44 appearance-none lg:h-10 lg:w-48 rounded-md border border-input bg-surface/80 pl-3 pr-9 text-sm text-foreground backdrop-blur-sm transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
        </div>
        )}

        <div
          role="group"
          aria-label="Layout"
          className="ml-auto flex items-center gap-0.5 rounded-md border border-input bg-surface/80 backdrop-blur-sm lg:p-0.5"
        >
          {VIEWS.map(({ key, label, icon: Icon }) => {
            const active = activeView === key;
            return (
              <button
                key={key}
                type="button"
                aria-label={label}
                aria-pressed={active}
                onClick={() => setParam("view", key === "grid" ? "" : key)}
                className={cn(
                  "flex size-11 items-center justify-center rounded transition-colors lg:size-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GenrePill({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "border-white/10 bg-background/40 text-foreground/80 hover:border-white/25 hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
}
