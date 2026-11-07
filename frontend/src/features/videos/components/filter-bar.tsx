"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { GENRES } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const SORTS = [
  { key: "popular", label: "Most viewed" },
  { key: "recent", label: "Recently published" },
  { key: "liked", label: "Most liked" },
] as const;

/**
 * Genre + sort controls for discovery pages (spec 3.13).
 * State lives in the URL so results are shareable and survive navigation
 * (frontend-engineer skill, section 9).
 */
export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeGenre = params.get("genre") ?? "";
  const activeSort = params.get("sort") ?? "popular";

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="mb-8 flex flex-col gap-4">
      {/* Genre pills — wrap onto new lines, no scrollbar. */}
      <div
        role="group"
        aria-label="Filter by genre"
        className="flex flex-wrap gap-2"
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
            active={activeGenre === g}
            onClick={() => setParam("genre", g)}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="sort" className="text-sm text-muted-foreground">
          Sort
        </label>
        <select
          id="sort"
          value={activeSort}
          onChange={(e) => setParam("sort", e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function GenrePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
