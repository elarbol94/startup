"use client";
// The canvas minimap sits bottom-right, above the "Übersicht" button, and can be hidden so
// it never has to cover frame content. Used by presentation-editor.tsx.
import { MiniMap, useReactFlow } from "@xyflow/react";
import { Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PresentationMiniMapNode } from "./canvas-decorations";

/** Clears the overview button (bottom-3 plus its height) so the two never overlap. */
const MINIMAP_STYLE = { marginBottom: 56, marginRight: 12, width: 180, height: 120 };

export function PresentationMiniMap({ label }: { label: string }) {
  const reactFlow = useReactFlow();
  return <MiniMap ariaLabel={label} className="!hidden sm:!block" position="bottom-right" style={MINIMAP_STYLE} pannable zoomable
    nodeComponent={PresentationMiniMapNode} bgColor="var(--background)" maskColor="rgb(100 116 139 / 0.12)"
    onClick={(_event, point) => { void reactFlow.setCenter(point.x, point.y, { zoom: reactFlow.getZoom(), duration: 150 }); }} />;
}

export function PresentationMiniMapToggle({ visible, onToggle, showLabel, hideLabel }: { visible: boolean; onToggle: () => void; showLabel: string; hideLabel: string }) {
  const label = visible ? hideLabel : showLabel;
  return <Button type="button" variant="ghost" size="icon-sm" className="hidden sm:inline-flex" aria-label={label} title={label} aria-pressed={visible} onClick={onToggle}>
    <MapIcon className="size-3.5" />
  </Button>;
}
