"use client";

import { useEffect, useState } from "react";

export type DocEditorInstance = {
  destroyEditor: () => void;
  downloadAs: (format?: string) => void;
  setUsers: (data: { c?: string; users: Array<{ id: string; name: string; email: string }> }) => void;
};
type DocsApi = { DocEditor: new (elementId: string, config: object) => DocEditorInstance };

declare global {
  interface Window { DocsAPI?: DocsApi }
}

const loading = new Map<string, Promise<DocsApi>>();

function load(src: string) {
  let promise = loading.get(src);
  if (promise) return promise;
  promise = new Promise<DocsApi>((resolve, reject) => {
    if (window.DocsAPI) { resolve(window.DocsAPI); return; }
    const element = document.createElement("script");
    element.src = src;
    element.async = true;
    const timer = window.setTimeout(() => reject(new Error("timeout")), 20_000);
    element.onload = () => { window.clearTimeout(timer); if (window.DocsAPI) resolve(window.DocsAPI); else reject(new Error("missing DocsAPI")); };
    element.onerror = () => { window.clearTimeout(timer); reject(new Error("load failed")); };
    document.head.appendChild(element);
  });
  // Allow a retry after a failure (e.g. while the document server restarts).
  promise.catch(() => {
    loading.delete(src);
    document.querySelectorAll(`script[src="${CSS.escape(src)}"]`).forEach((element) => element.remove());
  });
  loading.set(src, promise);
  return promise;
}

/** Loads the ONLYOFFICE DocsAPI script once per page; bump `attempt` to retry. */
export function useOnlyofficeScript(src: string | null, attempt: number) {
  const [state, setState] = useState<{ api: DocsApi | null; error: boolean }>({ api: null, error: false });
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    load(src).then(
      (api) => { if (!cancelled) setState({ api, error: false }); },
      () => { if (!cancelled) setState({ api: null, error: true }); },
    );
    return () => { cancelled = true; };
  }, [src, attempt]);
  return state;
}
