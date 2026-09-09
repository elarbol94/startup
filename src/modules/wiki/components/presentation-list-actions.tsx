"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createPresentation, createPresentationFromWikiPage, deletePresentation } from "../presentation-actions";
import { localizedPresentationTemplate, presentationTemplateIds, presentationTemplates, type PresentationTemplate, type PresentationTemplateId } from "../lib/presentation-templates";
import { presentationPaletteIds, presentationPalettes, type PresentationPaletteId } from "../lib/presentation-template-palettes";
import { defaultPresentationSettings } from "../lib/presentation";
import { PresentationScene } from "./presentation-scene";

/** Keep the full canvas visible while the camera focuses on the chosen stop. */
function TemplatePreview({ template, index = 0 }: { template: PresentationTemplate; index?: number }) {
  return <PresentationScene padding={0} index={0} presentation={{
    title: template.id, background: "#ffffff", settings: defaultPresentationSettings,
    steps: [template.steps[index]],
    elements: template.elements,
  }} />;
}

export function NewPresentationForm({ open: controlledOpen, onOpenChange, hideTrigger = false }: { open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean } = {}) {
  const language = useLocale();
  const locale = language === "en" ? "en" : "de";
  const t = useTranslations("wiki");
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<PresentationTemplateId | "blank">("topicmap");
  const [paletteId, setPaletteId] = useState<PresentationPaletteId>("original");
  const [previewIndex, setPreviewIndex] = useState(0);
  const catalog = useMemo(() => presentationTemplateIds.map((id) => localizedPresentationTemplate(presentationTemplates[id], locale, undefined, paletteId)), [locale, paletteId]);
  const preview = useMemo(() => selected === "blank" ? null : localizedPresentationTemplate(presentationTemplates[selected], locale, title, paletteId), [selected, locale, title, paletteId]);

  const choose = (id: PresentationTemplateId | "blank") => {
    setSelected(id);
    setPreviewIndex(0);
  };
  const create = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await createPresentation({ title: title.trim() || t("presentations.untitled"), templateId: selected === "blank" ? undefined : selected, locale, paletteId });
      setOpen(false);
      setTitle("");
      setBusy(false);
      router.push(`/wiki/presentations/${id}`);
    } catch {
      toast.error(t("presentations.createFailed"));
      setBusy(false);
    }
  };

  return (
    <>
      {!hideTrigger && <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />{t("presentations.new")}</Button>}
      <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
        <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-5 text-left">
            <DialogTitle className="text-2xl tracking-tight">{t("presentations.chooseTemplate")}</DialogTitle>
            <DialogDescription className="hidden sm:block">{t("presentations.chooseTemplateDescription")}</DialogDescription>
            <div className="mt-3 space-y-2">
              <Label htmlFor="new-presentation-title">{t("presentations.presentationTitle")}</Label>
              <Input id="new-presentation-title" value={title} disabled={busy} maxLength={200} placeholder={t("presentations.newPlaceholder")} onChange={(event) => setTitle(event.target.value)} />
            </div>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto lg:grid lg:grid-cols-[1.15fr_1fr]">
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{t("presentations.templateGallery")}</p>
                <span className="text-xs text-muted-foreground">{t("presentations.templateCount", { count: catalog.length })}</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-2 lg:gap-4">
                {catalog.map((template) => <button key={template.id} type="button" disabled={busy}
                  aria-label={t(`presentations.templates.${template.id}`)} aria-pressed={selected === template.id}
                  onClick={() => choose(template.id)}
                  className={cn("group w-40 shrink-0 overflow-hidden rounded-xl border bg-card text-left lg:w-auto transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:opacity-50", selected === template.id ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-muted-foreground/50")}>
                  <div className="pointer-events-none aspect-video overflow-hidden border-b" aria-hidden="true" inert><TemplatePreview template={template} /></div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{t(`presentations.templates.${template.id}`)}</span>
                      {selected === template.id && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                    </div>
                    <p className="mt-1 hidden min-h-8 text-xs leading-relaxed text-muted-foreground lg:block">{t(`presentations.templateDescriptions.${template.id}`)}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{t("presentations.templateSlides", { count: template.steps.length })}</p>
                  </div>
                </button>)}
                <button type="button" aria-label={t("presentations.templates.blank")} aria-pressed={selected === "blank"} disabled={busy} onClick={() => choose("blank")}
                  className={cn("col-span-2 flex w-40 shrink-0 items-center gap-3 rounded-xl lg:w-auto border border-dashed p-4 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring", selected === "blank" && "border-primary bg-accent ring-2 ring-primary/20")}>
                  <Plus className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="flex-1"><p className="text-sm font-semibold">{t("presentations.templates.blank")}</p><p className="mt-1 text-xs text-muted-foreground">{t("presentations.templateDescriptions.blank")}</p></div>
                  {selected === "blank" && <Check className="size-4 text-primary" aria-hidden="true" />}
                </button>
              </div>
            </div>
            <div className="border-t bg-muted/30 p-4 sm:p-6 lg:sticky lg:top-0 lg:self-start lg:border-t-0 lg:border-l">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">{t(`presentations.templates.${selected}`)}</h3>
                <span className="text-xs text-muted-foreground">{t("presentations.templatePreview")}</span>
              </div>
              {preview && <fieldset disabled={busy} className="mb-4">
                <legend className="mb-2 text-sm font-medium">{t("presentations.paletteLabel")}</legend>
                <div className="flex flex-wrap gap-2">
                  {presentationPaletteIds.map((id) => <button key={id} type="button" aria-pressed={paletteId === id}
                    onClick={() => setPaletteId(id)}
                    className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", paletteId === id ? "border-primary ring-2 ring-primary/20" : "border-border")}>
                    {id !== "original" && <span className="flex overflow-hidden rounded" aria-hidden="true">
                      {[presentationPalettes[id].ink, presentationPalettes[id].accent, presentationPalettes[id].soft].map((color) => <span key={color} className="h-4 w-3" style={{ backgroundColor: color }} />)}
                    </span>}
                    {t(`presentations.palettes.${id}`)}
                    {paletteId === id && <Check className="size-3" aria-hidden="true" />}
                  </button>)}
                </div>
              </fieldset>}
              <div className="aspect-video overflow-hidden rounded-lg border bg-white shadow-sm" aria-label={t("presentations.templatePreview")}>
                {preview ? <div className="pointer-events-none h-full w-full" inert><TemplatePreview template={preview} index={previewIndex} /></div> : <div className="grid h-full place-items-center text-slate-300"><Plus className="size-12" /></div>}
              </div>
              {preview && <div className="mt-3 flex items-center justify-between gap-3">
                <Button variant="outline" size="icon-sm" aria-label={t("presentations.templatePreviousPage")} disabled={previewIndex === 0 || busy} onClick={() => setPreviewIndex((index) => index - 1)}><ChevronLeft className="size-4" /></Button>
                <p className="text-xs text-muted-foreground" role="status" aria-live="polite">{t("presentations.templatePage", { current: previewIndex + 1, total: preview.steps.length })}</p>
                <Button variant="outline" size="icon-sm" aria-label={t("presentations.templateNextPage")} disabled={previewIndex === preview.steps.length - 1 || busy} onClick={() => setPreviewIndex((index) => index + 1)}><ChevronRight className="size-4" /></Button>
              </div>}
              <p className="mt-5 hidden text-sm leading-relaxed text-muted-foreground lg:block">{t(`presentations.templateDescriptions.${selected}`)}</p>
              <p className="mt-3 hidden text-xs leading-relaxed text-muted-foreground lg:block">{t("presentations.templateEditable")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 border-t bg-background px-4 py-4 sm:px-6">
            <p className="hidden text-xs text-muted-foreground sm:block">{t("presentations.templateReady")}</p>
            <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void create()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {t(selected === "blank" ? "presentations.createBlank" : "presentations.useTemplate")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function NewPresentationFromWikiPage({ pages, open: controlledOpen, onOpenChange, hideTrigger = false }: { pages: Array<{ id: string; title: string }>; open?: boolean; onOpenChange?: (open: boolean) => void; hideTrigger?: boolean }) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange ?? setLocalOpen;
  const [pageId, setPageId] = useState<string>(pages[0]?.id ?? "");
  const [includeImages, setIncludeImages] = useState(true);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!pageId) return;
    setBusy(true);
    try {
      const { id } = await createPresentationFromWikiPage({ pageId, includeImages });
      setOpen(false);
      setBusy(false);
      router.push(`/wiki/presentations/${id}`);
    } catch {
      toast.error(t("presentations.createFailed"));
      setBusy(false);
    }
  };

  return (
    <>
      {!hideTrigger && <Button type="button" variant="outline" size="sm" disabled={!pages.length} onClick={() => setOpen(true)}>
        <FileText className="size-3.5" />
        {t("presentations.fromWikiPage")}
      </Button>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("presentations.fromWikiPage")}</DialogTitle>
            <DialogDescription>{t("presentations.fromWikiPageDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="from-wiki-page-select">{t("presentations.wikiPage")}</Label>
              <Select value={pageId} onValueChange={(value) => setPageId(value ?? "")}>
                <SelectTrigger id="from-wiki-page-select" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pages.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeImages} onCheckedChange={(checked) => setIncludeImages(checked === true)} />
              {t("presentations.includeImages")}
            </label>
            <Button type="button" className="w-full" disabled={busy || !pageId} onClick={() => void create()}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              {t("presentations.new")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeletePresentationButton({ id, title, menuItem = false }: { id: string; title: string; menuItem?: boolean }) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const remove = async () => {
        if (!confirm(t("presentations.deleteConfirm", { title }))) return;
        try {
          await deletePresentation({ id });
          router.refresh();
        } catch {
          toast.error(t("presentations.deleteFailed"));
        }
      };
  if (menuItem) return <DropdownMenuItem className="text-destructive" onClick={remove}><Trash2 />{t("presentations.deletePresentation")}</DropdownMenuItem>;
  return <Button type="button" variant="ghost" size="icon-sm" aria-label={t("presentations.deletePresentation")} onClick={remove}><Trash2 className="size-4" /></Button>;
}
