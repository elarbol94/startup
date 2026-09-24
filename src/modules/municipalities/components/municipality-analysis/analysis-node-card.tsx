"use client";

// React Flow node card (dataset, operator, annotation) and the obstacle-avoiding edge of the analysis canvas.
// Used by analysis-editor.tsx through `nodeTypes` and `edgeTypes`.
import { useState } from "react";
import { BaseEdge, Handle, NodeResizer, Position, type EdgeProps, type NodeProps } from "@xyflow/react";
import { Database, Pin, PinOff, StickyNote, TriangleAlert } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAX_ANALYSIS_NODE_HEIGHT,
  MAX_ANALYSIS_NODE_WIDTH,
  MIN_ANALYSIS_NODE_HEIGHT,
  MIN_ANALYSIS_NODE_WIDTH,
  MIN_ANALYSIS_NOTE_HEIGHT,
  MIN_ANALYSIS_NOTE_WIDTH,
} from "../../analysis";
import { AnalysisSeriesChart } from "../analysis-series-chart";
import { NOTE_STYLES } from "./analysis-editor-constants";
import type { AnalysisDisplayEdge, DisplayNode } from "./analysis-editor-types";

function AnalysisNodeCard({ data, selected }: NodeProps<DisplayNode>) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(data.title);

  const finishTitle = () => {
    const value = draftTitle.trim();
    data.rename?.(value && value !== data.technicalTitle ? value : null);
    setEditingTitle(false);
  };

  if (data.kind === "annotation" && data.annotation) {
    return (
      <div className={cn("h-full w-full cursor-grab rounded-xl border shadow-sm active:cursor-grabbing", NOTE_STYLES[data.annotation.color], selected && "ring-2 ring-teal-600/35")}>
        <NodeResizer isVisible={selected} minWidth={MIN_ANALYSIS_NOTE_WIDTH} minHeight={MIN_ANALYSIS_NOTE_HEIGHT} maxWidth={MAX_ANALYSIS_NODE_WIDTH} maxHeight={MAX_ANALYSIS_NODE_HEIGHT} color="var(--color-teal-600)" />
        <div className="flex h-full min-h-0 flex-col p-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><StickyNote className="size-3.5" />{data.technicalTitle}</div>
          <Textarea
            key={data.annotation.text}
            className="nodrag mt-2 min-h-0 flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-5 shadow-none focus-visible:ring-0"
            defaultValue={data.annotation.text}
            maxLength={2_000}
            aria-label={data.technicalTitle}
            onBlur={(event) => data.annotation?.commit(event.currentTarget.value, data.annotation.color)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex h-full w-full cursor-grab flex-col rounded-xl border bg-card shadow-sm transition-shadow active:cursor-grabbing",
      data.kind === "operator" ? "border-violet-200 dark:border-violet-900" : "border-teal-200 dark:border-teal-900",
      selected && "border-teal-600 ring-2 ring-teal-600/20",
    )}>
      <NodeResizer isVisible={selected} minWidth={MIN_ANALYSIS_NODE_WIDTH} minHeight={MIN_ANALYSIS_NODE_HEIGHT} maxWidth={MAX_ANALYSIS_NODE_WIDTH} maxHeight={MAX_ANALYSIS_NODE_HEIGHT} color="var(--color-teal-600)" />
      {data.kind === "operator" && (
        <>
          <Handle type="target" id="a" position={Position.Left} style={{ top: data.singleInput ? "50%" : "38%" }} />
          {!data.singleInput && <Handle type="target" id="b" position={Position.Left} style={{ top: "72%" }} />}
          <span className="pointer-events-none absolute left-2 top-[32%] text-[9px] font-bold text-violet-700 dark:text-violet-300">A</span>
          {!data.singleInput && <span className="pointer-events-none absolute left-2 top-[66%] text-[9px] font-bold text-violet-700 dark:text-violet-300">B</span>}
        </>
      )}
      <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
        {data.kind === "dataset" ? <Database className="size-4 shrink-0 text-teal-700 dark:text-teal-300" /> : <span className="grid size-5 shrink-0 place-items-center rounded-md bg-violet-100 text-[11px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">{data.symbol}</span>}
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              className="nodrag h-6 w-full rounded border bg-background px-1.5 text-xs font-semibold"
              value={draftTitle}
              maxLength={120}
              aria-label={data.technicalTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={finishTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") { setDraftTitle(data.title); setEditingTitle(false); }
              }}
            />
          ) : (
            <button
              type="button"
              className="nodrag block max-w-full truncate text-left text-xs font-semibold"
              onDoubleClick={() => { setDraftTitle(data.title); setEditingTitle(true); }}
              onKeyDown={(event) => { if (event.key === "Enter") { setDraftTitle(data.title); setEditingTitle(true); } }}
              title={data.title}
            >{data.title}</button>
          )}
          <p className={cn("flex items-center gap-1 truncate text-[10px]", data.pinned ? "text-foreground" : "text-muted-foreground")}>
            {/* The pin is the control, not a badge: a node that arrived from the map is
                pinned, and releasing it here is what makes it follow the graph's subject. */}
            {data.togglePin ? (
              <button
                type="button"
                className="nodrag grid size-4 shrink-0 place-items-center rounded hover:bg-accent"
                aria-label={data.togglePin.label}
                title={data.togglePin.label}
                onClick={(event) => { event.stopPropagation(); data.togglePin?.apply(); }}
              >
                {data.pinned ? <Pin className="size-2.5" /> : <PinOff className="size-2.5" />}
              </button>
            ) : data.pinned && <Pin className="size-2.5 shrink-0" />}
            <span className="truncate">{data.title !== data.technicalTitle ? data.technicalTitle : data.subtitle}</span>
          </p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-2.5 py-2">
        {data.editor && (
          <input
            type="number"
            className="nodrag mb-2 h-8 w-full cursor-text rounded-lg border bg-background px-2 text-xs"
            aria-label={data.editor.label}
            min={data.editor.min}
            max={data.editor.max}
            step={data.editor.step}
            // Uncontrolled: the value settles on blur or Enter, so a half-typed "-" or
            // an empty field is never pushed into the graph. Keyed on the committed value
            // so a clamped or discarded entry does not keep standing in the field.
            key={data.editor.value}
            defaultValue={data.editor.value}
            onBlur={(event) => data.editor?.commit(Number(event.target.value))}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
          />
        )}
        {data.errorLabel ? (
          <p className="flex min-h-14 items-center gap-1.5 text-[11px] text-destructive"><TriangleAlert className="size-4 shrink-0" />{data.errorLabel}</p>
        ) : data.series ? (
          <div className="min-h-14 flex-1"><AnalysisSeriesChart series={data.series} label={data.title} compact trueLabel="1" falseLabel="0" /></div>
        ) : <div className="h-14 animate-pulse rounded-md bg-muted" />}
        {data.warningLabel && <p className="mt-1 truncate text-[10px] text-amber-700 dark:text-amber-300">{data.warningLabel}</p>}
      </div>
      <Handle type="source" id="output" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = { dataset: AnalysisNodeCard, operator: AnalysisNodeCard, annotation: AnalysisNodeCard };

function ObstacleAvoidingEdge({ data, sourceX, sourceY, targetX, targetY, style, markerEnd, markerStart, interactionWidth }: EdgeProps<AnalysisDisplayEdge>) {
  return (
    <BaseEdge
      path={data?.path ?? `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`}
      style={style}
      markerStart={markerStart}
      markerEnd={markerEnd}
      interactionWidth={interactionWidth}
    />
  );
}

export const edgeTypes = { analysis: ObstacleAvoidingEdge };
