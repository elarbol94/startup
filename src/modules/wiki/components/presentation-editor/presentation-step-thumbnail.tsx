"use client";
// One stop in the frame rail: its number, a live thumbnail of what the camera shows there,
// its label, and grip/remove controls -- PowerPoint's slide thumbnail for a canvas stop.
// Used by presentation-path-panel.tsx.
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PresentationSnapshot, PresentationStep } from "../../lib/presentation";
import { PresentationScene } from "../presentation-scene";

export function PresentationStepThumbnail({ step, index, scene, active, label, missing, readOnly, onSelect, onRemove, removeLabel, reorderLabel }: {
  step: PresentationStep;
  index: number;
  scene: PresentationSnapshot;
  active: boolean;
  label: string;
  missing: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onRemove: () => void;
  removeLabel: string;
  reorderLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id, disabled: readOnly });
  return (
    <li
      ref={setNodeRef}
      data-testid="presentation-step"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="group flex gap-1.5"
    >
      <div className="flex w-5 shrink-0 flex-col items-center gap-1 pt-1">
        <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
        <button type="button" disabled={readOnly} aria-label={reorderLabel} {...attributes} {...listeners}
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-60 group-hover:opacity-100 disabled:cursor-default disabled:opacity-30">
          <GripVertical className="size-3.5" />
        </button>
      </div>
      <div className={cn("relative min-w-0 flex-1 rounded-md border-2 bg-card p-0.5", active ? "border-indigo-500" : "border-transparent hover:border-border")}>
        <button type="button" onClick={onSelect} aria-current={active ? "step" : undefined} title={label} className="block w-full text-left">
          {/* Thumbnails only show; the canvas stays the one place where objects are edited. */}
          <div className="pointer-events-none aspect-video w-full overflow-hidden rounded-sm border bg-white" aria-hidden>
            {!missing && <PresentationScene presentation={scene} index={index} />}
          </div>
          <span className={cn("mt-0.5 block truncate px-0.5 text-xs", missing && "text-destructive")}>{label}</span>
        </button>
        <Button type="button" variant="secondary" size="icon-sm" disabled={readOnly} aria-label={removeLabel} onClick={onRemove}
          className="absolute top-1 right-1 size-6 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100">
          <X className="size-3" />
        </Button>
      </div>
    </li>
  );
}
