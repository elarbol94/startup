// Proofing helpers for the wiki editor: the stable key of a proofing issue and the handlers
// behind the proofing menu and suggestion popover. Used by wiki-editor.tsx.
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import type { useTranslations } from "next-intl";
import { toast } from "sonner";
import { getSpellcheckIssues, replaceAllSpellcheckOccurrences, setSpellcheckIssues, type ProofingLanguage, type SpellcheckIssue } from "../../lib/spellcheck";
import { disableMyWikiProofingRule, ignoreMyWikiProofingIssue, updateMyWikiProofingPicky } from "../../wiki-preference-actions";
import type { OpenProofingIssue } from "../wiki-proofing";

export type ProofingStatus = "ready" | "checking" | "error";

export function proofingIssueKey(issue: SpellcheckIssue) {
  return `${issue.ruleId}\u0000${issue.from}\u0000${issue.to}\u0000${issue.message}`;
}

export function createWikiProofingHandlers({
  activeEditor, pageId, t, spellcheckIssue, setSpellcheckIssue, proofingLanguage, setProofingLanguage,
  proofingSaving, setProofingSaving, proofingPicky, setProofingPicky, setProofingDictionary, setProofingDictionaryLoaded,
  proofingDictionarySaving, setProofingDictionarySaving, ignoredProofingIssues, disabledProofingRuleIds,
}: {
  activeEditor: Editor;
  pageId: string;
  t: ReturnType<typeof useTranslations<"wiki">>;
  spellcheckIssue: OpenProofingIssue | null;
  setSpellcheckIssue: Dispatch<SetStateAction<OpenProofingIssue | null>>;
  proofingLanguage: ProofingLanguage;
  setProofingLanguage: Dispatch<SetStateAction<ProofingLanguage>>;
  proofingSaving: boolean;
  setProofingSaving: Dispatch<SetStateAction<boolean>>;
  proofingPicky: boolean;
  setProofingPicky: Dispatch<SetStateAction<boolean>>;
  setProofingDictionary: Dispatch<SetStateAction<string[]>>;
  setProofingDictionaryLoaded: Dispatch<SetStateAction<boolean>>;
  proofingDictionarySaving: boolean;
  setProofingDictionarySaving: Dispatch<SetStateAction<boolean>>;
  ignoredProofingIssues: RefObject<Set<string>>;
  disabledProofingRuleIds: RefObject<Set<string>>;
}) {
  async function changeProofingLanguage(next: ProofingLanguage) {
    if (proofingSaving || next === proofingLanguage) return;
    const previous = proofingLanguage;
    setProofingSaving(true);
    setProofingDictionaryLoaded(false);
    setProofingDictionary([]);
    setProofingLanguage(next);
    setSpellcheckIssue(null);
    try {
      const response = await fetch("/api/wiki/pages/" + encodeURIComponent(pageId) + "/proofing-language", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: next }),
        keepalive: true,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Proofing language save failed");
    } catch {
      setProofingDictionaryLoaded(false);
      setProofingDictionary([]);
      setProofingLanguage(previous);
      toast.error(t("editor.proofing.saveFailed"));
    } finally {
      setProofingSaving(false);
    }
  }

  async function toggleProofingPicky() {
    if (proofingSaving) return;
    setProofingSaving(true);
    const previous = proofingPicky;
    const next = !previous;
    setProofingPicky(next);
    try {
      await updateMyWikiProofingPicky(next);
    } catch {
      setProofingPicky(previous);
      toast.error(t("editor.proofing.saveFailed"));
    } finally { setProofingSaving(false); }
  }

  function ignoreCurrentProofingIssue() {
    if (!spellcheckIssue) return;
    const key = proofingIssueKey(spellcheckIssue.issue);
    ignoredProofingIssues.current.add(key);
    setSpellcheckIssues(activeEditor, getSpellcheckIssues(activeEditor).filter((issue) => proofingIssueKey(issue) !== key));
    setSpellcheckIssue(null);
    void ignoreMyWikiProofingIssue(key).catch(() => toast.error(t("editor.proofing.preferenceFailed")));
  }

  function disableCurrentProofingRule() {
    if (!spellcheckIssue?.issue.ruleId) return;
    const { ruleId } = spellcheckIssue.issue;
    disabledProofingRuleIds.current.add(ruleId);
    setSpellcheckIssues(activeEditor, getSpellcheckIssues(activeEditor).filter((issue) => issue.ruleId !== ruleId));
    setSpellcheckIssue(null);
    void disableMyWikiProofingRule(ruleId).catch(() => toast.error(t("editor.proofing.preferenceFailed")));
  }

  async function addCurrentWordToDictionary() {
    if (!spellcheckIssue || spellcheckIssue.issue.kind !== "spelling" || proofingDictionarySaving) return;
    const word = spellcheckIssue.source.trim();
    if (!word) return;
    const language = proofingLanguage;
    setProofingDictionarySaving(true);
    try {
      const response = await fetch("/api/wiki/proofing-dictionary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, word }),
      });
      if (!response.ok) throw new Error("Dictionary save failed");
      const payload = await response.json() as { word: string };
      setProofingDictionary((current) => current.some((item) => item.toLocaleLowerCase(proofingLanguage) === payload.word.toLocaleLowerCase(proofingLanguage)) ? current : [...current, payload.word]);
      setSpellcheckIssue(null);
      toast.success(t("editor.proofing.dictionaryAdded", { word: payload.word }));
    } catch {
      toast.error(t("editor.proofing.dictionaryFailed"));
    } finally { setProofingDictionarySaving(false); }
  }

  function currentProofingIssue(replacement: string) {
    if (!spellcheckIssue || !activeEditor.isEditable) return null;
    const { issue, source } = spellcheckIssue;
    return getSpellcheckIssues(activeEditor).find((candidate) => candidate.from === issue.from && candidate.to === issue.to
      && !candidate.pending && candidate.ruleId === issue.ruleId && candidate.replacements.includes(replacement)
      && activeEditor.state.doc.textBetween(candidate.from, candidate.to) === source) ?? null;
  }

  function replaceAllCurrentProofingIssue(replacement: string) {
    const issue = currentProofingIssue(replacement);
    if (!issue) { setSpellcheckIssue(null); return; }
    const count = replaceAllSpellcheckOccurrences(activeEditor, issue, replacement);
    setSpellcheckIssue(null);
    activeEditor.commands.focus();
    if (count > 0) toast.success(t("editor.proofing.replacedAll", { count }));
  }

  function replaceCurrentProofingIssue(replacement: string) {
    const issue = currentProofingIssue(replacement);
    if (!issue) { setSpellcheckIssue(null); return; }
    // Suggestions are plain text, including an empty string for deletion.
    activeEditor.view.dispatch(activeEditor.state.tr.insertText(replacement, issue.from, issue.to).scrollIntoView());
    activeEditor.commands.focus();
    setSpellcheckIssue(null);
  }

  function nextProofingIssue() {
    activeEditor.commands.focus();
    activeEditor.commands.keyboardShortcut("Alt-F7");
  }

  return {
    changeProofingLanguage, toggleProofingPicky, ignoreCurrentProofingIssue, disableCurrentProofingRule,
    addCurrentWordToDictionary, replaceAllCurrentProofingIssue, replaceCurrentProofingIssue, nextProofingIssue,
  };
}
