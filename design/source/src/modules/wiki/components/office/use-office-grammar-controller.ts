"use client";

import { useCallback, useRef, useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { OfficeGrammarPanel } from "./office-grammar-panel";
import type { OfficeCommand, PluginEvent } from "./use-office-bridge";
import { useOfficeGrammar, type GrammarIssue, type ProofingLanguage } from "./use-office-grammar";

/**
 * Connects the editor's "Grammatik" button, the LanguageTool check and the
 * side panel: the plugin reads the paragraphs, the page checks them, and
 * selections/replacements go back to the plugin.
 */
export function useOfficeGrammarController(language: ProofingLanguage, send: (command: OfficeCommand) => void) {
  const t = useTranslations("officeDocuments.grammar");
  const grammar = useOfficeGrammar(language);
  const [open, setOpen] = useState(false);
  const pending = useRef(new Map<string, string>());

  const request = useCallback(() => { setOpen(true); send({ command: "collectParagraphs" }); }, [send]);

  const onPluginEvent = useCallback((event: PluginEvent) => {
    if (event.type === "grammarRequested") { request(); return; }
    if (event.type === "paragraphs") { void grammar.check(event.paragraphs); return; }
    const replacement = pending.current.get(event.id);
    pending.current.delete(event.id);
    if (event.result === "stale") { toast.info(t("stale")); return; }
    if (event.replaced && replacement !== undefined) grammar.resolve(event.id, replacement);
  }, [grammar, request, t]);

  const position = (issue: GrammarIssue) => ({ id: issue.id, index: issue.index, offset: issue.offset, length: issue.length, expected: issue.expected });

  const panel: ComponentProps<typeof OfficeGrammarPanel> = {
    issues: grammar.issues,
    state: grammar.state,
    onSelect: (issue) => send({ command: "selectIssue", ...position(issue) }),
    onReplace: (issue, replacement) => { pending.current.set(issue.id, replacement); send({ command: "replaceIssue", ...position(issue), replacement }); },
    onIgnore: (issue) => grammar.resolve(issue.id),
    onLearn: (issue) => {
      void fetch("/api/wiki/proofing-dictionary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language, word: issue.expected }) })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          for (const item of grammar.issues ?? []) if (item.kind === "spelling" && item.expected === issue.expected) grammar.resolve(item.id);
          toast.success(t("learned", { word: issue.expected }));
        })
        .catch(() => toast.error(t("learnFailed")));
    },
    onRecheck: request,
    onClose: () => { setOpen(false); grammar.close(); },
  };

  return { open, panel, onPluginEvent };
}
