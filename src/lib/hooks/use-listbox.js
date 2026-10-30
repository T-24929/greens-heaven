"use client";

import { useEffect, useMemo, useRef } from "react";
import { useOnOpen } from "@/lib/hooks/use-on-open.js";
import { useRowCursor } from "@/lib/hooks/use-row-cursor.js";

// How long typed characters keep building one typeahead query.
const TYPEAHEAD_MS = 500;

/**
 * Keyboard model for a popup listbox whose options are focusable buttons.
 */
export function useListbox({
  open,
  rows,
  selected,
  list,
}) {
  const enabled = useMemo(() => rows.filter((row) => !row.disabled), [rows]);
  const { activeIndex, moveTo, moveActive } = useRowCursor(enabled, "");
  useOnOpen(open, () =>
    moveTo(enabled.some((row) => row.id === selected) ? (selected ?? null) : null),
  );
  const activeId = enabled[activeIndex]?.id;
  const typed = useRef({ text: "", at: 0 });
  const openedOnMount = useRef(open);
  useEffect(() => {
    if (!open) openedOnMount.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || activeId === undefined) return;
    if (
      openedOnMount.current &&
      !list.current?.contains(document.activeElement)
    )
      return;
    const option = Array.from(
      list.current?.querySelectorAll("[data-listbox-id]") ?? [],
    ).find((element) => element.dataset.listboxId === activeId);
    option?.focus({ preventScroll: false });
  }, [open, activeId, list]);

  const onKeyDown = (event) => {
    const { key } = event;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      moveActive(key === "ArrowDown" ? 1 : -1);
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      const row = key === "Home" ? enabled[0] : enabled[enabled.length - 1];
      if (row) moveTo(row.id);
    } else if (
      key.length === 1 &&
      key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const char = key.toLowerCase();
      const text =
        now - typed.current.at < TYPEAHEAD_MS ? typed.current.text + char : char;
      typed.current = { text, at: now };
      const from = text.length === 1 ? activeIndex + 1 : activeIndex;
      for (let step = 0; step < enabled.length; step++) {
        const row = enabled[(from + step) % enabled.length];
        if (row.label.toLowerCase().startsWith(text)) {
          moveTo(row.id);
          break;
        }
      }
    }
  };

  return { activeId, onKeyDown };
}
