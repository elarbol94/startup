"use client";

// Loads the municipality index (names and bounding boxes) the network map positions everything by.
// The browser caches the file (see next.config.ts), and the Gemeinde map uses the same one.
import { useEffect, useMemo, useState } from "react";
import type { MunicipalityIndex, MunicipalityIndexItem } from "@/modules/municipalities/data";

export function useMunicipalityIndex() {
  const [state, setState] = useState<{ index: MunicipalityIndex | null; failed: boolean }>({ index: null, failed: false });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/municipalities-at-2026.index.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<MunicipalityIndex>;
      })
      .then((index) => setState({ index, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ index: null, failed: true });
      });
    return () => controller.abort();
  }, []);
  const byCode = useMemo(
    () => new Map<string, MunicipalityIndexItem>((state.index?.municipalities ?? []).map((item) => [item.municipalityCode, item])),
    [state.index],
  );
  return { ...state, byCode };
}
