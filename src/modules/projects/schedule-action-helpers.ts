// Shared schedule-edit input schemas and the authoritative schedule preview
// computation (scope loading, project links). Used by actions.ts, task-actions.ts
// and schedule-change-actions.ts.
import { z } from "zod";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projectDependencies,
  projectTaskDependencies,
  projects,
  taskDependencies,
  tasks,
} from "@/db/schema";
import {
  applyProjectLinkCascade,
  type ProjectScheduleLink,
  previewScheduleEdit,
  type SchedulePreview,
} from "@/modules/projects/schedule";
import { ScheduleError } from "./schedule-errors";

export const scheduleMoveSchema = z.object({
  entityType: z.enum(["task", "project"]).optional().default("task"),
  entityId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  operation: z
    .enum(["move", "resize-start", "resize-end", "place", "fit"])
    .optional()
    .default("move"),
}).superRefine((data, context) => {
  const id =
    data.entityId ??
    (data.entityType === "project" ? data.projectId : data.taskId);
  if (!id) {
    context.addIssue({
      code: "custom",
      path: ["entityId"],
      message: "A schedule entity is required",
    });
  }
  if (
    data.operation !== "fit" &&
    (!data.startDate || !data.dueDate)
  ) {
    context.addIssue({
      code: "custom",
      path: ["startDate"],
      message: "Schedule dates are required",
    });
  }
});

const expectedScheduleChangeSchema = z.object({
  entityType: z.enum(["task", "project"]),
  entityId: z.string().min(1),
  beforeStartDate: z.string().nullable(),
  beforeDueDate: z.string().nullable(),
  afterStartDate: z.string().nullable(),
  afterDueDate: z.string().nullable(),
  cause: z
    .enum(["direct", "fit", "subtree", "dependency", "ancestor-expansion"])
    .optional(),
});

export const scheduleApplySchema = scheduleMoveSchema.and(
  z.object({
    expectedPreview: z
      .object({
        changes: z.array(expectedScheduleChangeSchema),
      })
      .optional(),
  }),
);

function scheduleEntityId(input: z.infer<typeof scheduleMoveSchema>): string {
  const id =
    input.entityId ??
    (input.entityType === "project" ? input.projectId : input.taskId);
  if (!id) throw new ScheduleError("invalid", "A schedule entity is required");
  return id;
}

type ScheduleReader = Pick<typeof db, "select">;

/** Project-level finish-to-start links, in the planner's shape. */
function projectScheduleLinks(reader: ScheduleReader): ProjectScheduleLink[] {
  return [
    ...reader
      .select()
      .from(projectDependencies)
      .all()
      .map((link) => ({
        predecessorType: link.predecessorType,
        predecessorId: link.predecessorId,
        successorType: "project" as const,
        successorId: link.successorProjectId,
      })),
    ...reader
      .select()
      .from(projectTaskDependencies)
      .all()
      .map((link) => ({
        predecessorType: "project" as const,
        predecessorId: link.predecessorProjectId,
        successorType: "task" as const,
        successorId: link.successorTaskId,
      })),
  ];
}

/**
 * The projects a schedule edit can reach: the one being edited plus any joined
 * to it by a task dependency or a project-level link. Everything outside that
 * set is untouchable, so there is no reason to load it.
 */
function scheduleScope(
  reader: ScheduleReader,
  projectId: string,
  dependencies: { predecessorTaskId: string; successorTaskId: string }[],
  links: ProjectScheduleLink[],
): Set<string> {
  const projectByTask = new Map(
    reader
      .select({ id: tasks.id, projectId: tasks.projectId })
      .from(tasks)
      .all()
      .map((task) => [task.id, task.projectId]),
  );
  const endpointProject = (type: "project" | "task", id: string) =>
    type === "project" ? id : projectByTask.get(id);
  const edges = [
    ...dependencies.map((dependency) => [
      projectByTask.get(dependency.predecessorTaskId),
      projectByTask.get(dependency.successorTaskId),
    ]),
    ...links.map((link) => [
      endpointProject(link.predecessorType, link.predecessorId),
      endpointProject(link.successorType, link.successorId),
    ]),
  ];
  const scope = new Set([projectId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [from, to] of edges) {
      if (!from || !to || from === to) continue;
      if (scope.has(from) && !scope.has(to)) {
        scope.add(to);
        grew = true;
      } else if (scope.has(to) && !scope.has(from)) {
        scope.add(from);
        grew = true;
      }
    }
  }
  return scope;
}

function loadSchedulePlan(
  input: z.infer<typeof scheduleMoveSchema>,
  reader: ScheduleReader,
) {
  const entityId = scheduleEntityId(input);
  const dependencies = reader.select().from(taskDependencies).all();
  const links = projectScheduleLinks(reader);
  const rootProjectId =
    input.entityType === "project"
      ? entityId
      : reader
          .select({ projectId: tasks.projectId })
          .from(tasks)
          .where(eq(tasks.id, entityId))
          .get()?.projectId;
  if (!rootProjectId) throw new ScheduleError("not-found", "Task not found");
  const scope = scheduleScope(reader, rootProjectId, dependencies, links);
  const scopeIds = [...scope];

  const taskRows = reader
    .select({
      id: tasks.id,
      projectId: sql<string>`${tasks.projectId}`,
      parentTaskId: tasks.parentTaskId,
      startDate: tasks.startDate,
      dueDate: tasks.dueDate,
      progress: tasks.progress,
      isMilestone: tasks.isMilestone,
      constraintType: tasks.constraintType,
      constraintDate: tasks.constraintDate,
    })
    .from(tasks)
    .where(inArray(tasks.projectId, scopeIds))
    .all();
  const projectRows = reader
    .select({
      id: projects.id,
      name: projects.name,
      startDate: projects.plannedStartDate,
      dueDate: projects.targetEndDate,
    })
    .from(projects)
    .where(inArray(projects.id, scopeIds))
    .all();
  const taskIdsInScope = new Set(taskRows.map((task) => task.id));
  const scopedDependencies = dependencies.filter(
    (dependency) =>
      taskIdsInScope.has(dependency.predecessorTaskId) &&
      taskIdsInScope.has(dependency.successorTaskId),
  );
  return {
    tasks: taskRows,
    projects: projectRows,
    dependencies: scopedDependencies,
    links,
    edit: {
      entityType: input.entityType,
      entityId,
      operation: input.operation,
      startDate: input.startDate,
      dueDate: input.dueDate,
    },
  };
}

/** The edit and its task-level cascade only; project-level links are ignored. */
export function computeSchedulePreview(
  input: z.infer<typeof scheduleMoveSchema>,
  reader: ScheduleReader = db,
): SchedulePreview {
  return previewScheduleEdit(loadSchedulePlan(input, reader));
}

/**
 * The edit plus the push of project-level successors. `core` is what the
 * timeline previews locally (it does not know project links); `preview` is
 * what gets written and recorded for undo.
 */
export function computeLinkedSchedulePreview(
  input: z.infer<typeof scheduleMoveSchema>,
  reader: ScheduleReader = db,
): { core: SchedulePreview; preview: SchedulePreview } {
  const plan = loadSchedulePlan(input, reader);
  const core = previewScheduleEdit(plan);
  return { core, preview: applyProjectLinkCascade({ ...plan, preview: core }) };
}
