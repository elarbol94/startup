"use client";

import { useEffect, useRef, useState } from "react";
import { leadKinds, type LeadKind } from "../constants";
import type { MunicipalityValue } from "./municipality-picker";

export type CaptureForm = {
  name: string;
  target: string;
  note: string;
  kind: LeadKind;
  metContext: string;
  tags: string[];
  metToday: boolean;
  municipality: MunicipalityValue;
};

export const emptyCaptureForm: CaptureForm = {
  name: "", target: "", note: "", kind: "info", metContext: "", tags: [], metToday: true, municipality: null,
};

/** Whether anything worth keeping was entered; the kind and "met today" alone are not. */
export function hasCaptureContent(form: CaptureForm) {
  return Boolean(form.name.trim() || form.note.trim() || form.metContext.trim() || form.tags.length || form.municipality);
}

/** Reads a stored draft defensively: anything malformed falls back to the empty form's value. */
export function restoreCaptureForm(raw: unknown): CaptureForm | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const text = (key: keyof CaptureForm, max: number) => (typeof value[key] === "string" ? (value[key] as string).slice(0, max) : "");
  const municipality = value.municipality as { code?: unknown; name?: unknown } | null | undefined;
  const form: CaptureForm = {
    name: text("name", 160),
    target: text("target", 100),
    note: text("note", 1000),
    kind: leadKinds.includes(value.kind as LeadKind) ? (value.kind as LeadKind) : "info",
    metContext: text("metContext", 300),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 20) : [],
    metToday: typeof value.metToday === "boolean" ? value.metToday : true,
    municipality: municipality && typeof municipality.code === "string" && /^\d{5}$/.test(municipality.code) && typeof municipality.name === "string"
      ? { code: municipality.code, name: municipality.name }
      : null,
  };
  return hasCaptureContent(form) ? form : null;
}

/**
 * The quick-capture form, kept while the dialog is closed and in this
 * browser's storage (per user), so an interrupted capture survives closing,
 * navigating away and reloading. Cleared on save or an explicit discard.
 */
export type CaptureDraft = ReturnType<typeof useCaptureDraft>;

export function useCaptureDraft(userId: string) {
  const key = `network-capture-draft:${userId}`;
  const [form, setForm] = useState<CaptureForm>(emptyCaptureForm);
  /** True once a draft came back from storage, until it is saved or discarded. */
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const restoredForm = restoreCaptureForm(JSON.parse(window.localStorage.getItem(key) ?? "null"));
      // Restoring browser storage after mount keeps the server render identical.
      if (restoredForm) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm(restoredForm);
        setRestored(true);
      }
    } catch {
      // Storage unavailable or corrupt: start empty.
    }
    loaded.current = true;
  }, [key]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (hasCaptureContent(form)) window.localStorage.setItem(key, JSON.stringify(form));
      else window.localStorage.removeItem(key);
    } catch {
      // The draft still lives in memory for this page.
    }
  }, [form, key]);

  return {
    form,
    setForm,
    clear: () => {
      setForm(emptyCaptureForm);
      setRestored(false);
    },
    hasDraft: hasCaptureContent(form),
    restored,
  };
}
