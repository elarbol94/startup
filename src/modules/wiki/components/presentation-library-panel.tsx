"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ColorPicker } from "@/components/ui/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { presentationFonts, presentationIconNames, type PresentationSnapshot } from "../lib/presentation";
import type { getPresentationStudio } from "../presentation-studio";
import { presentationIcons } from "./presentation-content";

type Studio = Awaited<ReturnType<typeof getPresentationStudio>>;
type Theme = NonNullable<Studio["library"][number]["theme"]>;
const selectClass = "h-9 w-full rounded-md border bg-background px-2 text-sm";

export function PresentationLibraryPanel({ section, id, selectedId, canEdit, flush, onTheme, onTemplate, onAsset, onIcon, onSelect }: {
  section: "design" | "assets" | "sharing" | "comments";
  id: string; selectedId?: string; canEdit: boolean; flush: () => Promise<boolean>;
  onTheme: (theme: Theme) => void; onTemplate: (snapshot: PresentationSnapshot) => void;
  onAsset: (id: string, name: string) => void; onIcon: (name: typeof presentationIconNames[number]) => void; onSelect: (id: string) => void;
}) {
  const t = useTranslations("presentationStudio");
  const [studio, setStudio] = useState<Studio | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [selectionOnly, setSelectionOnly] = useState(false);
  const requestVersion = useRef(0);
  const [shareUrl, setShareUrl] = useState("");
  const [theme, setTheme] = useState<Theme>({ background: "#ffffff", foreground: "#172033", accent: "#6366f1", font: "sans" });
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    const response = await fetch(`/api/wiki/presentations/${id}/studio`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unavailable");
    const result = await response.json();
    if (version === requestVersion.current) { setStudio(result); setError(false); }
  }, [id]);
  useEffect(() => {
    let disposed = false;
    const load = () => { if (!disposed) void refresh().catch(() => { if (!disposed) setError(true); }); };
    load(); const timer = setInterval(load, 10000);
    return () => { disposed = true; clearInterval(timer); };
  }, [refresh]);
  const act = async (data: Record<string, unknown>, apply?: (result: { token?: string | null; snapshot?: PresentationSnapshot; attachmentId?: string }) => void) => {
    if (busy) return; setBusy(true); requestVersion.current += 1;
    try {
      if (canEdit && !await flush()) return;
      const response = await fetch(`/api/wiki/presentations/${id}/studio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("Update failed");
      const result = await response.json(); apply?.(result); await refresh();
    } catch { toast.error(t("operationFailed")); } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try {
      if (canEdit && !await flush()) return;
      const response = await fetch(`/api/wiki/presentations/${id}/offline`);
      if (!response.ok) throw new Error("Export failed");
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = "presentation.html"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error(t("operationFailed")); } finally { setBusy(false); }
  };
  return <div className="space-y-4">
    {error && <button type="button" className="text-xs text-destructive underline" onClick={() => void refresh().catch(() => setError(true))}>{t("loadFailed")}</button>}
    <section hidden={section !== "design"} className="space-y-4" aria-label={t("designLibrary")}>
      <p className="text-xs text-muted-foreground">{t("companyLibraryHint")}</p>
      <fieldset disabled={!canEdit || busy} className="space-y-3">
        <label className="block text-xs">{t("designName")}<Input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
        <div className="flex flex-wrap gap-3">{(["background", "foreground", "accent"] as const).map((key) => <label className="text-xs" key={key}>{t(key)}<ColorPicker disabled={!canEdit || busy} aria-label={t(key)} className="flex" value={theme[key]} onChange={(color) => setTheme({ ...theme, [key]: color })} /></label>)}</div>
        <label className="block text-xs">{t("font")}<select className={selectClass} value={theme.font} onChange={(event) => setTheme({ ...theme, font: event.target.value as Theme["font"] })}>{presentationFonts.map((font) => <option key={font} value={font}>{t(`fonts.${font}`)}</option>)}</select></label>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onTheme(theme)}>{t("applyTheme")}</Button><Button type="button" variant="outline" size="sm" disabled={!name.trim()} onClick={() => void act({ action: "theme", name, theme })}>{t("saveTheme")}</Button><Button type="button" variant="outline" size="sm" disabled={!name.trim()} onClick={() => void act({ action: "template", name })}>{t("saveTemplate")}</Button></div>
      </fieldset>
      {studio?.library.map((entry) => <div key={entry.id} className="flex items-center gap-2 border-t pt-2 text-xs"><span className="min-w-0 flex-1 truncate">{entry.name}</span><Button type="button" size="sm" variant="outline" disabled={!canEdit || busy} onClick={() => {
        if (entry.theme) onTheme(entry.theme);
        else if (window.confirm(t("replaceTemplateConfirm"))) void act({ action: "applyTemplate", libraryId: entry.id }, (result) => result.snapshot && onTemplate(result.snapshot));
      }}>{t("apply")}</Button>{entry.removable && <Button type="button" size="sm" variant="ghost" aria-label={t("deleteDesign")} disabled={!canEdit || busy} onClick={() => { if (window.confirm(t("deleteDesignConfirm"))) void act({ action: "deleteLibrary", libraryId: entry.id }); }}>×</Button>}</div>)}
    </section>
    <section hidden={section !== "assets"} className="space-y-4" aria-label={t("assetLibrary")}>
      <Input aria-label={t("searchAssets")} placeholder={t("searchAssets")} value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="grid grid-cols-4 gap-2">{presentationIconNames.filter((name) => `${name} ${t(`icons.${name}`)}`.toLowerCase().includes(search.toLowerCase())).map((name) => { const Icon = presentationIcons[name]; return <button className="grid place-items-center gap-1 rounded border p-2 text-[10px] disabled:opacity-50" title={t(`icons.${name}`)} disabled={!canEdit || busy} type="button" key={name} onClick={() => onIcon(name)}><Icon className="size-6" />{t(`icons.${name}`)}</button>; })}</div>
      <div className="grid max-h-60 grid-cols-2 gap-2 overflow-auto">{studio?.assets.filter((asset) => asset.name.toLowerCase().includes(search.toLowerCase())).map((asset) => <button key={asset.id} type="button" disabled={!canEdit || busy} className="min-w-0 rounded border p-1 text-xs disabled:opacity-50" onClick={() => void act({ action: "reuseAsset", attachmentId: asset.id }, (result) => result.attachmentId && onAsset(result.attachmentId, asset.name))}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="h-16 w-full object-contain" src={`/api/files/${asset.id}`} alt="" loading="lazy" /><span className="block truncate">{asset.name}</span>
      </button>)}</div>
    </section>
    <section hidden={section !== "sharing"} className="space-y-4" aria-label={t("sharing")}>
      {studio?.role === "owner" && <>
        <p className="text-xs text-muted-foreground">{t("coeditingAutomatic")}</p>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy || !canEdit} checked={studio.access.restricted} onChange={(event) => void act({ action: "access", restricted: event.target.checked, coediting: true })} />{t("restricted")}</label>
        <p className="text-xs text-muted-foreground">{t("permissionsHint")}</p>
        {studio.users.map((user) => <label className="flex items-center gap-2 text-xs" key={user.id}><span className="min-w-0 flex-1 truncate">{user.name}</span><select className="h-8 rounded border bg-background" aria-label={`${t("permission")} ${user.name}`} disabled={busy || !canEdit} value={studio.members.find((member) => member.userId === user.id)?.role ?? "remove"} onChange={(event) => void act({ action: "member", userId: user.id, role: event.target.value })}>{["remove", "view", "comment", "edit"].map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}</select></label>)}
        <p className="text-xs text-muted-foreground">{t("publicHint")}</p>
        <Button type="button" size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => void act({ action: "public", enabled: true }, (result) => setShareUrl(result.token ? `${window.location.origin}/share/presentations/${result.token}` : ""))}>{studio.access.publicEnabled ? t("replaceLink") : t("createLink")}</Button>
        {studio.access.publicEnabled && <Button type="button" size="sm" variant="outline" disabled={busy || !canEdit} onClick={() => void act({ action: "public", enabled: false }, () => setShareUrl(""))}>{t("revokeLink")}</Button>}
        {shareUrl && <><label className="block text-xs">{t("shareLink")}<Input readOnly value={shareUrl} onFocus={(event) => event.target.select()} /></label><label className="block text-xs">{t("embedCode")}<textarea className="w-full rounded border p-2 text-xs" readOnly rows={3} value={`<iframe src="${shareUrl}?embed=1" title="Presentation" width="960" height="540" allow="fullscreen" allowfullscreen></iframe>`} onFocus={(event) => event.target.select()} /></label></>}
      </>}
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void download()}>{t("offlineExport")}</Button>
      <p className="text-xs text-muted-foreground">{t("offlineHint")}</p>
    </section>
    <section hidden={section !== "comments"} className="space-y-4" aria-label={t("comments")}>
      {studio && studio.role !== "view" && <><p className="text-xs text-muted-foreground">{selectedId ? t("commentOnSelection") : t("commentOnCanvas")}</p><textarea data-workspace-autofocus className="w-full rounded-md border p-2 text-sm" aria-label={t("newComment")} rows={3} disabled={busy} maxLength={3000} value={comment} onChange={(event) => setComment(event.target.value)} /><Button type="button" size="sm" disabled={busy || !comment.trim()} onClick={() => void act({ action: "comment", elementId: selectedId, body: comment }, () => setComment(""))}>{t("postComment")}</Button></>}
      {selectedId && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectionOnly} onChange={(event) => setSelectionOnly(event.target.checked)} />{t("selectionOnly")}</label>}
      {!studio?.comments.filter((entry) => !selectionOnly || !selectedId || entry.elementId === selectedId).length && <p className="text-xs text-muted-foreground">{t("noComments")}</p>}
      {studio?.comments.filter((entry) => !selectionOnly || !selectedId || entry.elementId === selectedId).map((entry) => <article key={entry.id} className={`border-t pt-2 text-xs ${entry.resolved ? "opacity-60" : ""}`}><p className="font-medium">{entry.author} {entry.resolved && `(${t("resolved")})`}</p>{editingId === entry.id ? <div className="my-2 space-y-2"><textarea aria-label={t("editComment")} className="w-full rounded-md border p-2 text-sm" rows={3} maxLength={3000} disabled={busy} value={editBody} onChange={(event) => setEditBody(event.target.value)} /><div className="flex gap-2"><Button type="button" size="xs" disabled={busy || !editBody.trim()} onClick={() => void act({ action: "editComment", commentId: entry.id, body: editBody }, () => setEditingId(null))}>{t("saveComment")}</Button><Button type="button" size="xs" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>{t("cancelComment")}</Button></div></div> : <p className="my-1 whitespace-pre-wrap break-words">{entry.body}</p>}<div className="flex flex-wrap gap-2">{entry.canManage && editingId !== entry.id && <><button className="underline" type="button" disabled={busy} onClick={() => { setEditingId(entry.id); setEditBody(entry.body); }}>{t("editComment")}</button><button className="text-destructive underline" type="button" disabled={busy} onClick={() => { if (window.confirm(t("deleteCommentConfirm"))) void act({ action: "deleteComment", commentId: entry.id }); }}>{t("deleteComment")}</button></>}{entry.elementId && <button className="underline" type="button" onClick={() => onSelect(entry.elementId!)}>{t("showObject")}</button>}{studio.role !== "view" && <button className="underline" type="button" disabled={busy} onClick={() => void act({ action: "resolve", commentId: entry.id, resolved: !entry.resolved })}>{entry.resolved ? t("reopen") : t("resolve")}</button>}</div></article>)}
    </section>
  </div>;
}
