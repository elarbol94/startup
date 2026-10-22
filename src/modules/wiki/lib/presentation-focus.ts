import type { PresentationPosition, PresentationSceneId } from "./presentation-details";

type FocusStage = { elementId: string; returnPosition: PresentationPosition };

/** Local focus hierarchy for each canvas; entering a detail never destroys its parent's focus. */
export class PresentationFocusHistory {
  private stages = new Map<PresentationSceneId, FocusStage[]>();
  current(scene: PresentationSceneId): string | null {
    return this.stages.get(scene)?.at(-1)?.elementId ?? null;
  }
  push(scene: PresentationSceneId, elementId: string, position: PresentationPosition, ancestors: string[] = []): boolean {
    if (this.current(scene) === elementId) return false;
    const stack = this.stages.get(scene) ?? [];
    let shared = 0;
    while (shared < stack.length && ancestors.includes(stack[shared].elementId)) shared++;
    // Moving sideways between sibling forms keeps the same containing stage.
    const parentPosition = stack[shared]?.returnPosition ?? position;
    this.stages.set(scene, [...stack.slice(0, shared), { elementId,
      returnPosition: { index: parentPosition.index, returns: [...parentPosition.returns] } }]);
    return true;
  }
  pop(scene: PresentationSceneId): PresentationPosition | null {
    const stack = this.stages.get(scene);
    const stage = stack?.at(-1);
    if (!stage) return null;
    this.stages.set(scene, stack!.slice(0, -1));
    return stage.returnPosition;
  }
  clear(scene: PresentationSceneId): void {
    this.stages.delete(scene);
  }
}
