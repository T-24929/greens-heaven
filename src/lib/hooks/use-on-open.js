"use client";

import { useState } from "react";

/**
 * Runs `start` during the render in which `open` becomes true.
 * Opening a list starts a fresh session — an empty query, the highlight back at
 * the top — and that is a resolution, not a side effect.
 */
export function useOnOpen(open, start) {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) start();
  }
}
