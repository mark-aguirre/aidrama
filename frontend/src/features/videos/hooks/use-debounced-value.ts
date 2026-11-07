"use client";

import * as React from "react";

/**
 * `value` once it has held still for `delayMs`. Lets a text input stay fully
 * responsive while the request it drives waits for a pause in typing.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = React.useState(value);

  React.useEffect(() => {
    const id = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return settled;
}
