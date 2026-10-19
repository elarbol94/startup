"use client";

import { useEffect, useRef, useState } from "react";

function documentFor(html: string, allowRemote: boolean) {
  const remote = allowRemote ? " https: http:" : "";
  // Second layer after server-side sanitising: no scripts at all, and remote
  // images/fonts/styles (tracking pixels) only once the reader allows them.
  const policy = `default-src 'none'; img-src data:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}; media-src data:`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><base target="_blank"><style>
html,body{margin:0;background:#fff;color:#1f2328}
body{padding:16px 20px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}
img{max-width:100%;height:auto}
table{max-width:100%}
pre{white-space:pre-wrap}
blockquote{margin:0 0 0 .5em;padding-left:.75em;border-left:2px solid #d0d7de;color:#57606a}
</style></head><body>${html}</body></html>`;
}

/**
 * Renders a sanitised HTML mail in a sandboxed frame: scripts never run
 * (no allow-scripts), links open in a new tab, and the frame grows with its
 * content so the reader scrolls one surface, not two.
 */
export function HtmlMailBody({ html, allowRemote, title }: { html: string; allowRemote: boolean; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: ResizeObserver | null = null;
    const measure = () => {
      const doc = element.contentDocument;
      if (!doc?.documentElement) return;
      setHeight(Math.max(80, doc.documentElement.scrollHeight));
    };
    const onLoad = () => {
      measure();
      observer?.disconnect();
      const body = element.contentDocument?.body;
      if (body) {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    };
    element.addEventListener("load", onLoad);
    return () => {
      element.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, []);

  return (
    <iframe
      ref={frame}
      title={title}
      srcDoc={documentFor(html, allowRemote)}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="block w-full rounded-lg border bg-white"
      style={{ height }}
    />
  );
}

const urlPattern = /(https?:\/\/[^\s<>"')\]]+)/g;

/** Plain-text mail with clickable links and quoted lines dimmed. */
export function TextMailBody({ text }: { text: string }) {
  return (
    <div className="rounded-lg border bg-card px-5 py-4 text-sm leading-relaxed break-words whitespace-pre-wrap">
      {text.split("\n").map((line, index) => (
        <span key={index} className={line.startsWith(">") ? "text-muted-foreground" : undefined}>
          {line.split(urlPattern).map((part, partIndex) =>
            partIndex % 2 === 1
              ? <a key={partIndex} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{part}</a>
              : part)}
          {"\n"}
        </span>
      ))}
    </div>
  );
}
