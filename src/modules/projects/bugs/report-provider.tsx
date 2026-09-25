"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Bug, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canonicalTaskHref } from "@/modules/context/routes";
import { getBugReportContext, submitBugReport } from "./actions";
import { AreaCapture } from "./area-capture";

const ReportContext = createContext<() => void>(() => {});
export const useBugReporter = () => useContext(ReportContext);
type Screenshot = { id: string; file: File; url: string; state: "pending" | "saved" | "failed" };
type Receipt = { number: number; taskId: string; projectId: string };

export function BugReportProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("bugReports");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectingArea, setSelectingArea] = useState(false);
  const endSelection = useCallback(() => { setSelectingArea(false); setOpen(true); }, []);
  const [context, setContext] = useState<Awaited<ReturnType<typeof getBugReportContext>> | null>(null);
  const [source, setSource] = useState({ path: "", browser: "" });
  const [title, setTitle] = useState("");
  const [happened, setHappened] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const screenshotsRef = useRef(screenshots);
  useEffect(() => { screenshotsRef.current = screenshots; }, [screenshots]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const submissionId = useRef("");
  useEffect(() => () => screenshotsRef.current.forEach(item => URL.revokeObjectURL(item.url)), []);

  function reset() {
    screenshots.forEach(item => URL.revokeObjectURL(item.url));
    setScreenshots([]); setReceipt(null); setTitle(""); setHappened(""); setSteps(""); setExpected(""); setError("");
    submissionId.current = "";
  }
  async function show() {
    if (!submissionId.current) {
      submissionId.current = crypto.randomUUID();
      setSource({ path: pathname, browser: navigator.userAgent.slice(0, 500) });
    }
    setOpen(true);
    try { setContext(await getBugReportContext()); } catch { setError(t("failed")); }
  }
  function addFiles(files: File[]) {
    if (receipt || busy) return;
    if (screenshots.length + files.length > 5 || files.some(file => !file.size || file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
      setError(t("invalidFiles")); return;
    }
    setError("");
    setScreenshots(current => [...current, ...files.map(file => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), state: "pending" as const }))]);
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      let saved = receipt;
      if (!saved) {
        const result = await submitBugReport({ submissionId: submissionId.current, title, happened, steps, expected, pagePath: source.path, browser: source.browser, locale: locale === "de" ? "de" : "en" });
        if ("error" in result) { setError(t("archived")); return; }
        saved = result; setReceipt(result);
      }
      let failed = false;
      for (const item of screenshots.filter(item => item.state !== "saved")) {
        try {
          const form = new FormData(); form.set("file", item.file); form.set("entityType", "task"); form.set("entityId", saved.taskId); form.set("uploadId", item.id);
          const response = await fetch("/api/files", { method: "POST", body: form });
          if (!response.ok) throw new Error("Upload failed");
          setScreenshots(current => current.map(row => row.id === item.id ? { ...row, state: "saved" } : row));
        } catch {
          failed = true; setScreenshots(current => current.map(row => row.id === item.id ? { ...row, state: "failed" } : row));
        }
      }
      if (failed) setError(t("uploadFailed"));
      router.refresh();
    } catch { setError(t("failed")); }
    finally { submitting.current = false; setBusy(false); }
  }
  const failedUploads = screenshots.some(item => item.state !== "saved");
  return <ReportContext.Provider value={() => { void show(); }}>
    {children}
    {selectingArea && <AreaCapture onCancel={endSelection} onError={() => { setError(t("captureFailed")); endSelection(); }} onCapture={file => { addFiles([file]); setSource(current => ({ ...current, path: pathname })); endSelection(); }} />}
    {!selectingArea && <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onPaste={event => {
        const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); addFiles(files); }
      }}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Bug className="size-5" />{t("report")}</DialogTitle><DialogDescription>{t("shared")}</DialogDescription></DialogHeader>
        {context?.project ? <Link className="text-sm underline" href={`/projects/${context.project.id}`} onClick={() => setOpen(false)}>{t("viewReports")}</Link> : <p className="text-xs text-muted-foreground">{t("noReports")}</p>}
        {receipt ? <div role="status" className="rounded-md border bg-muted/40 p-3 space-y-2"><p className="font-medium">{t("saved", { number: receipt.number })}</p><Link className="text-sm underline" href={canonicalTaskHref(receipt.taskId, receipt.projectId)} onClick={() => { setOpen(false); if (!failedUploads) reset(); }}>{t("openReport")}</Link></div> :
          <form id="bug-report-form" onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-3">
            <div className="space-y-1"><Label htmlFor="bug-title">{t("title")}</Label><Input id="bug-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={300} required disabled={busy} /></div>
            <div className="space-y-1"><Label htmlFor="bug-happened">{t("happened")}</Label><Textarea id="bug-happened" value={happened} onChange={event => setHappened(event.target.value)} rows={3} maxLength={2000} required disabled={busy} /></div>
            <details><summary className="cursor-pointer text-sm">{t("optionalDetails")}</summary><div className="mt-3 space-y-3">
              <div className="space-y-1"><Label htmlFor="bug-steps">{t("steps")}</Label><Textarea id="bug-steps" value={steps} onChange={event => setSteps(event.target.value)} maxLength={1200} disabled={busy} /></div>
              <div className="space-y-1"><Label htmlFor="bug-expected">{t("expected")}</Label><Textarea id="bug-expected" value={expected} onChange={event => setExpected(event.target.value)} maxLength={1200} disabled={busy} /></div>
            </div></details>
          </form>}
        <div className="space-y-2"><Label htmlFor="bug-screenshots">{t("screenshots")}</Label>
          {!receipt && <><Button type="button" variant="outline" disabled={busy || screenshots.length >= 5} onClick={() => { setOpen(false); setSelectingArea(true); }}>{t("selectArea")}</Button><p className="text-xs text-muted-foreground">{t("captureHint")}</p></>}
          {!receipt && <><Input id="bug-screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /><p className="text-xs text-muted-foreground">{t("fileHint")}</p></>}
          <div className="grid grid-cols-3 gap-2">{screenshots.map(item => <div key={item.id} className="relative min-w-0 rounded border p-1">
            {/* Local object URLs are previews, never remote image requests. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={item.file.name} className="h-20 w-full object-contain" />
            <p className="truncate text-xs">{item.file.name}</p>
            {receipt && <p className="text-xs">{t(item.state === "saved" ? "uploaded" : item.state === "failed" ? "uploadError" : "pending")}</p>}
            {item.state !== "saved" && <Button type="button" variant="secondary" size="icon-sm" className="absolute right-0 top-0" aria-label={t("remove", { name: item.file.name })} disabled={busy} onClick={() => { URL.revokeObjectURL(item.url); setScreenshots(current => current.filter(row => row.id !== item.id)); }}><X className="size-3" /></Button>}
          </div>)}</div>
        </div>
        <details className="rounded border p-2 text-xs text-muted-foreground"><summary className="cursor-pointer">{t("included")}</summary><dl className="mt-2 space-y-1 break-all"><dt>{t("page")}</dt><dd>{source.path}</dd><dt>{t("version")}</dt><dd>{context?.buildVersion ?? "—"}</dd><dt>{t("browser")}</dt><dd>{source.browser}</dd><dt>{t("time")}</dt><dd>{context ? new Date(context.time).toLocaleString(locale) : "—"}</dd></dl><p className="mt-2">{t("timeHint")}</p></details>
        {context?.project?.status === "archived" && !receipt && <p role="alert" className="text-sm text-destructive">{t("archived")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          {receipt ? <>{failedUploads ? <Button disabled={busy} onClick={() => void submit()}>{busy && <Loader2 className="size-4 animate-spin" />}{t("retryUploads")}</Button> : <Button onClick={() => { reset(); setOpen(false); }}>{t("close")}</Button>}</> : <Button form="bug-report-form" type="submit" disabled={busy || !context || context.project?.status === "archived" || !title.trim() || !happened.trim()}>{busy && <Loader2 className="size-4 animate-spin" />}{t("submit")}</Button>}
        </div>
      </DialogContent>
    </Dialog>}
  </ReportContext.Provider>;
}
