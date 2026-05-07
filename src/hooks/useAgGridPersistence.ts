"use client";
import { useCallback, useEffect, useRef } from "react";
import type { GridReadyEvent, GridApi } from "ag-grid-community";

interface Options {
  storageKey: string;
  fallbackFit?: boolean;
}

export function useAgGridPersistence({ storageKey, fallbackFit = true }: Options) {
  const apiRef = useRef<GridApi | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const state = api.getColumnState();
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
    }, 250);
  }, [storageKey]);

  const restoreFor = useCallback((api: GridApi, key: string) => {
    let restored = false;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const state = JSON.parse(raw);
        if (Array.isArray(state) && state.length > 0) {
          api.applyColumnState({ state, applyOrder: true });
          restored = true;
        }
      }
    } catch {}
    if (!restored && fallbackFit) {
      api.sizeColumnsToFit();
    }
  }, [fallbackFit]);

  const onGridReady = useCallback((params: GridReadyEvent) => {
    apiRef.current = params.api;
    restoreFor(params.api, storageKey);
  }, [storageKey, restoreFor]);

  // When the storageKey changes (e.g. user switches active property), reset
  // the existing grid to that key's saved state — otherwise the previous
  // property's column widths/order leak into the new view.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    restoreFor(api, storageKey);
  }, [storageKey, restoreFor]);

  return {
    onGridReady,
    onColumnResized: save,
    onColumnMoved: save,
    onColumnVisible: save,
    onColumnPinned: save,
    onSortChanged: save,
  };
}
