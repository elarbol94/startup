"use client";
// The top of the Eigenschaften pane: what is selected (type and name), the frame it sits in --
// one click selects that frame -- and the actions every object has, in one row. A locked object
// says so and offers to unlock, instead of leaving the author with greyed-out fields.
import { useTranslations } from "next-intl";
import { BringToFront, ChartColumn, Copy, Film, Frame, Group, Image as ImageIcon, Lock, LockOpen, Music, SendToBack, Shapes, Smile, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presentationAncestors, type PresentationElement } from "../../../lib/presentation";

const TYPE_ICONS = { text: Type, shape: Shapes, image: ImageIcon, chart: ChartColumn, icon: Smile, video: Film, audio: Music, frame: Frame, group: Group } as const;

export function typeKey(element: PresentationElement): keyof typeof TYPE_ICONS {
  return element.type === "frame" && element.content.isGroup ? "group" : element.type;
}

/** What an author would call the object: a frame's label, a text's first words, a chart's title. */
export function elementName(element: PresentationElement, elements: PresentationElement[]): string {
  const clip = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 40);
  switch (element.type) {
    case "text": return clip(element.content.text);
    case "shape": return clip(element.content.text ?? "");
    case "frame": {
      if (element.content.label) return clip(element.content.label);
      const heading = elements.find((child) => child.parentId === element.id && child.type === "text");
      return heading?.type === "text" ? clip(heading.content.text) : "";
    }
    case "chart": return clip(element.content.title);
    case "image": return clip(element.content.alt);
    case "video": case "audio": return clip(element.content.title);
    default: return "";
  }
}

export function PropertiesHeader({ selection, elements, disabled, locked, lockedByParent, run, commands, onSelect }: {
  selection: PresentationElement[]; elements: PresentationElement[]; disabled: boolean;
  /** The object, or a frame around it, is locked. */
  locked: boolean; lockedByParent: boolean;
  run: (id: string) => void;
  /** Editor command ids that are currently available. */
  commands: Set<string>;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("wiki.presentations");
  const single = selection.length === 1 ? selection[0] : undefined;
  const parent = single?.parentId ? elements.find((element) => element.id === single.parentId) : undefined;
  const Icon = single ? TYPE_ICONS[typeKey(single)] : Group;
  const name = single ? elementName(single, elements) : "";
  const action = (id: string, label: string, icon: React.ReactNode) => <Button key={id} type="button" size="icon-sm" variant="ghost" aria-label={label} title={label}
    disabled={disabled || !commands.has(id)} onClick={() => run(id)}>{icon}</Button>;
  return <div className="space-y-2 border-b pb-3">
    <div className="flex items-start gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold" data-testid="properties-title">
          {single ? t(`elementTypes.${typeKey(single)}`) : t("properties.objects", { count: selection.length })}
        </h2>
        {name && <p className="truncate text-xs text-muted-foreground" title={name}>{name}</p>}
        {parent && <button type="button" className="max-w-full truncate text-xs text-primary hover:underline" title={t("properties.selectParent")} onClick={() => onSelect(parent.id)}>
          {t("properties.inFrame", { name: elementName(parent, elements) || t(`elementTypes.${typeKey(parent)}`) })}
        </button>}
      </div>
    </div>
    <div role="toolbar" aria-label={t("properties.actions")} className="flex flex-wrap items-center gap-0.5">
      {action("duplicateSelection", t("duplicateElement"), <Copy />)}
      {selection.some((element) => element.locked) ? !(locked && !lockedByParent) && action("unlock", t("interactions.unlock"), <LockOpen />) : action("lock", t("interactions.lock"), <Lock />)}
      {action("front", t("interactions.front"), <BringToFront />)}
      {action("back", t("interactions.back"), <SendToBack />)}
      <span className="flex-1" />
      {action("deleteSelection", t("deleteElement"), <Trash2 />)}
    </div>
    {locked && <div role="status" className="flex items-center gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
      <Lock className="size-3.5 shrink-0" />
      <span className="flex-1">{lockedByParent ? t("properties.lockedByFrame") : t("properties.locked")}</span>
      {!lockedByParent && <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => run("unlock")}>{t("interactions.unlock")}</Button>}
    </div>}
  </div>;
}

/** The object is locked itself, or sits inside a locked frame. */
export function lockState(element: PresentationElement | undefined, elements: PresentationElement[]) {
  if (!element) return { locked: false, byParent: false };
  const byParent = presentationAncestors(elements, element.id).some((ancestor) => ancestor.locked);
  return { locked: Boolean(element.locked) || byParent, byParent: byParent && !element.locked };
}
