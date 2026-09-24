"use client";
// Background proofing for the wiki editor: loads the personal dictionary, counts issues and
// runs the batched spellcheck controller against the document. Used by wiki-editor.tsx.
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { collectSpellcheckParagraphs, getSpellcheckIssues, setSpellcheckIssues, type ProofingLanguage, type SpellcheckResponseMatch } from "../../lib/spellcheck";
import { createSpellcheckController } from "../../lib/spellcheck-controller";
import type { OpenProofingIssue } from "../wiki-proofing";
import { proofingIssueKey, type ProofingStatus } from "./wiki-editor-proofing";

export function useWikiProofingChecks({
  editor, pageId, proofingLanguage, proofingPicky, proofingDictionary, proofingDictionaryLoaded,
  setProofingDictionary, setProofingDictionaryLoaded, setProofingCount, setSpellcheckIssue, setProofingStatus,
  ignoredProofingIssues, disabledProofingRuleIds, proofingRetry: proofingRetryRef,
}: {
  editor: Editor | null;
  pageId: string;
  proofingLanguage: ProofingLanguage;
  proofingPicky: boolean;
  proofingDictionary: string[];
  proofingDictionaryLoaded: boolean;
  setProofingDictionary: Dispatch<SetStateAction<string[]>>;
  setProofingDictionaryLoaded: Dispatch<SetStateAction<boolean>>;
  setProofingCount: Dispatch<SetStateAction<number>>;
  setSpellcheckIssue: Dispatch<SetStateAction<OpenProofingIssue | null>>;
  setProofingStatus: Dispatch<SetStateAction<ProofingStatus>>;
  ignoredProofingIssues: RefObject<Set<string>>;
  disabledProofingRuleIds: RefObject<Set<string>>;
  proofingRetry: RefObject<() => void>;
}) {
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/wiki/proofing-dictionary?language=${encodeURIComponent(proofingLanguage)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Dictionary unavailable");
        return response.json() as Promise<{ words: string[] }>;
      })
      .then(({ words }) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(words) || words.some((word) => typeof word !== "string")) throw new Error("Invalid dictionary");
        setProofingDictionary(words);
        setProofingDictionaryLoaded(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setProofingDictionary([]);
        setProofingDictionaryLoaded(true);
      });
    return () => controller.abort();
  }, [proofingLanguage, setProofingDictionary, setProofingDictionaryLoaded]);

  useEffect(() => {
    if (!editor) return;
    const count = () => setProofingCount(getSpellcheckIssues(editor).length);
    editor.on("transaction", count);
    return () => { editor.off("transaction", count); };
  }, [editor, setProofingCount]);
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("lang", proofingLanguage);
    setSpellcheckIssues(editor, []);
    if (!proofingDictionaryLoaded) return;
    const dictionary = new Set(proofingDictionary.map((word) => word.normalize("NFKC").toLocaleLowerCase(proofingLanguage)));
    let proofingDoc = editor.state.doc;
    let proofingParagraphs = collectSpellcheckParagraphs(proofingDoc);
    const checker = createSpellcheckController({
      snapshot: () => {
        if (proofingDoc !== editor.state.doc) {
          proofingDoc = editor.state.doc;
          proofingParagraphs = collectSpellcheckParagraphs(proofingDoc);
        }
        return { paragraphs: proofingParagraphs, cursor: editor.state.selection.from, issues: getSpellcheckIssues(editor) };
      },
      language: proofingLanguage,
      composing: () => editor.view.composing,
      request: async (batch, signal) => {
        const response = await fetch("/api/wiki/spellcheck", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal,
          body: JSON.stringify({ paragraphs: batch.items.map((item) => item.text), language: proofingLanguage, picky: proofingPicky }),
        });
        if (!response.ok) throw new Error("Spellcheck unavailable");
        const payload = await response.json() as { matches: SpellcheckResponseMatch[] };
        if (!Array.isArray(payload.matches)) throw new Error("Invalid spellcheck response");
        return payload.matches;
      },
      publish: (issues) => {
        const filtered = issues.filter((issue) => !ignoredProofingIssues.current.has(proofingIssueKey(issue)) && !disabledProofingRuleIds.current.has(issue.ruleId)
          && (issue.kind !== "spelling" || !dictionary.has(editor.state.doc.textBetween(issue.from, issue.to).normalize("NFKC").toLocaleLowerCase(proofingLanguage))));
        const previous = getSpellcheckIssues(editor);
        if (previous.length === filtered.length && previous.every((issue, index) => {
          const next = filtered[index];
          return issue.from === next.from && issue.to === next.to && issue.kind === next.kind && issue.ruleId === next.ruleId
            && issue.pending === next.pending && issue.message === next.message && issue.category === next.category && issue.replacements === next.replacements;
        })) return;
        setSpellcheckIssues(editor, filtered);
        setSpellcheckIssue((selected) => {
          if (!selected) return null;
          const issue = filtered.find((item) => item.from === selected.issue.from && item.to === selected.issue.to && item.ruleId === selected.issue.ruleId);
          return issue ? { ...selected, issue } : null;
        });
      },
      status: setProofingStatus,
      timing: (timing) => {
        // Local, bounded diagnostics: no text, page identifiers or telemetry.
        for (const [phase, duration] of [["queue", timing.queueMs], ["request", timing.requestMs], ["apply", timing.applyMs]] as const) {
          const name = `wiki-proofing.${phase}`;
          performance.clearMeasures(name);
          performance.measure(name, { start: Math.max(0, performance.now() - duration), duration, detail: timing });
        }
      },
    });
    const update = () => { setSpellcheckIssue(null); checker.schedule(); };
    editor.on("update", update);
    window.addEventListener("online", checker.retry);
    proofingRetryRef.current = checker.retry;
    checker.start();
    return () => {
      checker.dispose();
      editor.off("update", update);
      window.removeEventListener("online", checker.retry);
      proofingRetryRef.current = () => {};
    };
  }, [editor, pageId, proofingDictionary, proofingDictionaryLoaded, proofingLanguage, proofingPicky, disabledProofingRuleIds, ignoredProofingIssues, proofingRetryRef, setProofingStatus, setSpellcheckIssue]);
}
