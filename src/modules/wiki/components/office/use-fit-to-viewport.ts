"use client";

import { useEffect, useRef } from "react";

/**
 * The editor must end at the bottom of the window (its status bar with the
 * language and zoom controls lives there), below whatever app chrome sits
 * above it. Height = window height minus the element's top offset.
 */
export function useFitToViewport() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      const top = element.getBoundingClientRect().top + window.scrollY;
      element.style.height = `${Math.max(360, window.innerHeight - top)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(document.body);
    window.addEventListener("resize", fit);
    return () => { observer.disconnect(); window.removeEventListener("resize", fit); };
  }, []);
  return ref;
}
