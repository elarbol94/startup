"use client";
import { UserIdentity } from "@/components/user-identity";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { previewPlatformRestore, restorePlatformVersion } from "@/modules/settings/version-control/actions";
import type { Preview, Side } from "@/modules/settings/version-control/store";

export function VersionDialog({ id, title, hasBefore, hasAfter }: { id: number; title: string; hasBefore: boolean; hasAfter: boolean }) {
  const t = useTranslations("settings.versionControl");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function load(side: Side) {
    setPending(true); setError(null); setPreview(null); setConfirmed(false);
    try { setPreview(await previewPlatformRestore({ id, side })); }
    catch { setError(t("failed")); }
    finally { setPending(false); }
  }
  async function restore() {
    if (!preview || !confirmed || pending) return;
    setPending(true); setError(null);
    try {
      const result = await restorePlatformVersion({ id, side: preview.side, token: preview.token, reason });
      if (result.error) { setError(t(`problems.${result.error}`)); setConfirmed(false); return; }
      setOpen(false); toast.success(t("restored")); router.refresh();
    } catch { setError(t("failed")); }
    finally { setPending(false); }
  }
  function download() {
    if (!preview) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: id, table: preview.version.table_name, record: JSON.parse(preview.version.record_key), side: preview.side, snapshot: preview.target }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `version-${id}-${preview.side}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => { setOpen(true); setReason(""); void load(hasAfter ? "after" : "before"); }}>{t("inspect")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("previewTitle", { title })}</DialogTitle><DialogDescription>{t("previewDescription")}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap gap-2">
          {hasBefore && <Button size="sm" variant={preview?.side === "before" ? "default" : "outline"} disabled={pending} onClick={() => void load("before")}>{t("before")}</Button>}
          {hasAfter && <Button size="sm" variant={preview?.side === "after" ? "default" : "outline"} disabled={pending} onClick={() => void load("after")}>{t("after")}</Button>}
        </div>
        {pending && <p role="status" className="text-sm">{t("working")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {preview && <>
          {preview.problem && <p role="status" className="rounded-md border bg-muted p-3 text-sm">{t(`problems.${preview.problem}`)}</p>}
          <div className="max-h-72 overflow-auto rounded-md border">
            <table className="w-full text-sm text-left"><thead><tr className="bg-muted"><th className="p-2">{t("field")}</th><th className="p-2">{t("current")}</th><th className="p-2">{t("selected")}</th></tr></thead>
              <tbody>{preview.changes.map(change => <tr key={change.field} className="border-t align-top"><th className="p-2 font-medium">{t.has(`fields.${change.field}`) ? t(`fields.${change.field}`) : change.field.replaceAll("_", " ")}</th><td className="p-2 max-w-64 whitespace-pre-wrap break-words"><VersionValue field={change.field} value={change.current} /></td><td className="p-2 max-w-64 whitespace-pre-wrap break-words"><VersionValue field={change.field} value={change.target} /></td></tr>)}</tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" className="w-fit" onClick={download}>{t("download")}</Button>
          {!preview.problem && <>
            <label className="grid gap-1 text-sm">{t("reason")}<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={2} className="rounded-md border p-2" /></label>
            <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("confirm")}</label>
          </>}
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>{t("close")}</Button><Button disabled={pending || !!preview.problem || !confirmed || reason.trim().length < 3} onClick={() => void restore()}>{t("restore")}</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

function VersionValue({ field, value }: { field: string; value: string | number | null }) {
  const userField = ["created_by", "updated_by", "changed_by", "uploaded_by", "author_id", "actor_id", "user_id", "assignee_id", "manager_id", "host_user_id"].includes(field);
  return <>{userField && typeof value === "string" && value && <><UserIdentity userId={value} compact /><br /></>}{String(value ?? "—").slice(0, 1000)}</>;
}
