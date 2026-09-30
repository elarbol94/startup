"use client";

import { useCallback, useRef, useState } from "react";

export type ProofingLanguage = "de-DE" | "de-AT" | "en-US";
export type GrammarIssue = {
  id: string;
  index: number;
  offset: number;
  length: number;
  /** The checked text at that position; replacing is refused when it changed. */
  expected: string;
  context: { before: string; after: string };
  message: string;
  kind: "spelling" | "writing";
  category: string;
  replacements: string[];
};
type Paragraph = { index: number; text: string };
type Match = { paragraph: number; offset: number; length: number; message: string; kind: "spelling" | "writing"; category: string; replacements: string[] };

// Limits of /api/wiki/spellcheck.
const MAX_PARAGRAPHS = 80;
const MAX_CHARACTERS = 24_000;

function batches(paragraphs: Paragraph[]) {
  const result: Paragraph[][] = [];
  let current: Paragraph[] = [], size = 0;
  for (const paragraph of paragraphs) {
    const text = paragraph.text.slice(0, MAX_CHARACTERS);
    if (current.length && (current.length >= MAX_PARAGRAPHS || size + text.length > MAX_CHARACTERS)) { result.push(current); current = []; size = 0; }
    current.push({ index: paragraph.index, text });
    size += text.length;
  }
  if (current.length) result.push(current);
  return result;
}

/**
 * Grammar and spelling for office documents through the app's LanguageTool
 * route (the same service and shared dictionary as the old editor).
 */
export function useOfficeGrammar(language: ProofingLanguage) {
  const [issues, setIssues] = useState<GrammarIssue[] | null>(null);
  const [state, setState] = useState<"idle" | "checking" | "error">("idle");
  const run = useRef(0);

  const check = useCallback(async (paragraphs: Paragraph[]) => {
    const current = ++run.current;
    setState("checking");
    try {
      const dictionary = await fetch(`/api/wiki/proofing-dictionary?language=${language}`).then((response) => response.ok ? response.json() as Promise<{ words: string[] }> : { words: [] }).then((result) => result.words.slice(0, 500), () => []);
      const found: GrammarIssue[] = [];
      for (const batch of batches(paragraphs)) {
        const response = await fetch("/api/wiki/spellcheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paragraphs: batch.map((paragraph) => paragraph.text), language, dictionary }),
        });
        if (!response.ok) throw new Error(String(response.status));
        const { matches } = await response.json() as { matches: Match[] };
        for (const match of matches) {
          const paragraph = batch[match.paragraph];
          if (!paragraph) continue;
          found.push({
            id: `${paragraph.index}:${match.offset}:${match.length}`,
            index: paragraph.index, offset: match.offset, length: match.length,
            expected: paragraph.text.substr(match.offset, match.length),
            context: { before: paragraph.text.slice(Math.max(0, match.offset - 40), match.offset), after: paragraph.text.slice(match.offset + match.length, match.offset + match.length + 40) },
            message: match.message, kind: match.kind, category: match.category, replacements: match.replacements.slice(0, 5),
          });
        }
      }
      if (current !== run.current) return;
      setIssues(found);
      setState("idle");
    } catch {
      if (current === run.current) setState("error");
    }
  }, [language]);

  /** Drops an issue; later issues in the same paragraph move by the length change. */
  const resolve = useCallback((id: string, replacement?: string) => {
    setIssues((current) => {
      const issue = current?.find((item) => item.id === id);
      if (!current || !issue) return current;
      const delta = replacement === undefined ? 0 : replacement.length - issue.length;
      return current.filter((item) => item.id !== id).map((item) => item.index === issue.index && item.offset > issue.offset ? { ...item, offset: item.offset + delta } : item);
    });
  }, []);

  return { issues, state, check, resolve, close: () => { run.current++; setIssues(null); setState("idle"); } };
}
