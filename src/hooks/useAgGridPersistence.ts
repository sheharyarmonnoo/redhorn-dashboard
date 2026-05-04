"use client";
import { useCallback, useRef } from "react";
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

  const onGridReady = useCallback((params: GridReadyEvent) => {
    apiRef.current = params.api;
    let restored = false;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const state = JSON.parse(raw);
        if (Array.isArray(state) && state.length > 0) {
          params.api.applyColumnState({ state, applyOrder: true });
          restored = true;
        }
      }
    } catch {}
    if (!restored && fallbackFit) {
      params.api.sizeColumnsToFit();
    }
  }, [storageKey, fallbackFit]);

  return {
    onGridReady,
    onColumnResized: save,
    onColumnMoved: save,
    onColumnVisible: save,
    onColumnPinned: save,
    onSortChanged: save,
  };
}
