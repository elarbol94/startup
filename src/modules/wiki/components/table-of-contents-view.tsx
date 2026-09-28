"use client";

import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslations } from "next-intl";

type HeadingEntry = { level: number; text: string; position: number };

function collectHeadings(editor: NodeViewProps["editor"]): HeadingEntry[] {
  const items: HeadingEntry[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "heading") items.push({ level: Number(node.attrs.level), text: node.textContent, position });
  });
  return items;
}

export function TableOfContentsView({ node, editor, selected }: NodeViewProps) {
  const t = useTranslations("wiki");
  const maxLevel = Number(node.attrs.maxLevel) || 3;
  const title = String(node.attrs.title || "");
  const [headings, setHeadings] = useState<HeadingEntry[]>(() => collectHeadings(editor));

  useEffect(() => {
    let frame = 0;
    const scheduleRefresh = () => {
      cancelAnimationFrame(frame);
      // Batching to one frame keeps this list from re-walking the document mid-burst.
      frame = requestAnimationFrame(() => setHeadings(collectHeadings(editor)));
    };
    scheduleRefresh();
    editor.on("update", scheduleRefresh);
    return () => {
      cancelAnimationFrame(frame);
      editor.off("update", scheduleRefresh);
    };
  }, [editor]);

  const entries = headings.filter((heading) => heading.level <= maxLevel);

  function jumpTo(position: number) {
    const heading = editor.view.nodeDOM(position) as HTMLElement | null;
    const top = heading?.getBoundingClientRect().top ?? 0;
    window.scrollBy({ top: top - 84, behavior: "smooth" });
    editor.chain().focus().setTextSelection(position + 1).run();
  }

  return (
    <NodeViewWrapper className={`wiki-document-toc${selected ? " ring-2 ring-indigo-400" : ""}`} data-document-toc="">
      <strong>{title || t("document.contents")}</strong>
      {entries.length
        ? <ol className="mt-1 space-y-0.5">
            {entries.map((heading) => <li key={heading.position} className={`toc-level-${heading.level}`} style={{ paddingLeft: `${(heading.level - 1) * 0.85}rem` }}>
              <button
                type="button"
                disabled={!editor.isEditable}
                onClick={() => jumpTo(heading.position)}
                className="flex w-full items-baseline justify-between gap-2 rounded-sm py-0.5 text-left hover:underline disabled:cursor-default disabled:no-underline"
              >
                <span>{heading.text || t("editor.outline.untitled")}</span>
              </button>
            </li>)}
          </ol>
        : <p>{t("editor.outline.empty")}</p>}
    </NodeViewWrapper>
  );
}
