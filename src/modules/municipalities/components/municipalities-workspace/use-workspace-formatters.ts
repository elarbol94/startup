"use client";

// Locale-bound number and date formatters of the municipalities workspace.
// Used by municipalities-workspace.tsx.
import { useMemo } from "react";

export function useWorkspaceFormatters(locale: string) {
  const personsFormatter = useMemo(
    () => new Intl.NumberFormat(locale),
    [locale],
  );
  const shareFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const signedShareFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        signDisplay: "always",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const ratioFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  // A saved Kennzahl can be a factor near 1 or a count in the hundred thousands, so it keeps
  // four significant digits but never rounds away whole units.
  const kennzahlFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
        maximumSignificantDigits: 4,
        roundingPriority: "morePrecision",
      }),
    [locale],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }),
    [locale],
  );
  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }),
    [locale],
  );
  const digitalCostFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
    [locale],
  );
  const signedDecimalFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        signDisplay: "always",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  return {
    personsFormatter, shareFormatter, signedShareFormatter, ratioFormatter, kennzahlFormatter,
    dateFormatter, currencyFormatter, digitalCostFormatter, signedDecimalFormatter,
  };
}

export type WorkspaceFormatters = ReturnType<typeof useWorkspaceFormatters>;
