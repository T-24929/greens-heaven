"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** The cursor's row, or -1 once the query has moved on or the row has left. */
function indexOfCursor(rows, query, cursor) {
  if (cursor === null || cursor.query !== query) return -1;
  return rows.findIndex((row) => row.id === cursor.id);
}

/**
 * The highlighted row of a list whose rows can change under it.
 */
export function useRowCursor(rows, query = "") {
  const [cursor, setCursor] = useState(null);
  const latest = useRef({ rows, query });
  useLayoutEffect(() => {
    latest.current = { rows, query };
  });

  const cursorRow = indexOfCursor(rows, query, cursor);
  if (cursor !== null && cursorRow < 0) setCursor(null);

  const moveTo = useCallback(
    (id) =>
      setCursor(id === null ? null : { id, query: latest.current.query }),
    [],
  );

  const moveActive = useCallback((direction) => {
    const { rows: live, query: liveQuery } = latest.current;
    const last = live.length - 1;
    if (last < 0) return;
    setCursor((current) => {
      const at = Math.max(indexOfCursor(live, liveQuery, current), 0);
      const next = Math.min(Math.max(at + direction, 0), last);
      return { id: live[next].id, query: liveQuery };
    });
  }, []);

  return { activeIndex: cursorRow < 0 ? 0 : cursorRow, moveTo, moveActive };
}
