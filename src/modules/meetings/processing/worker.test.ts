import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processUploadSessions: vi.fn(async () => {}),
  reconcileCalls: vi.fn(async () => {}),
  merge: vi.fn(async () => {}),
}));
vi.mock("server-only", () => ({}));
vi.mock("./uploads", () => ({ processUploadSessions: mocks.processUploadSessions }));
vi.mock("../calls/recording", () => ({ reconcileCalls: mocks.reconcileCalls }));
vi.mock("./stages", () => ({ stageHandlers: { merge: mocks.merge } }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("@/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});

import { db, sqlite } from "@/db";
import { resetDatabase, seedMeeting } from "../test-helpers";
import { enqueueJob } from "./jobs";
import { drainMeetingJobs, runMeetingMaintenanceTick } from "./worker";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

let meetingId: string;
beforeEach(() => {
  resetDatabase();
  meetingId = seedMeeting().id;
  vi.clearAllMocks();
});
afterAll(() => sqlite.close());

describe("meeting worker loops", () => {
  it("assembles uploads and reconciles calls while a long job is running", async () => {
    const job = deferred();
    mocks.merge.mockImplementationOnce(() => job.promise);
    enqueueJob(db, { meetingId, stage: "merge", executionKey: "slow", policyRevision: 1 });
    const draining = drainMeetingJobs();
    await vi.waitFor(() => expect(mocks.merge).toHaveBeenCalled());

    await runMeetingMaintenanceTick(Date.now() + 10 * 60_000);
    expect(mocks.processUploadSessions).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileCalls).toHaveBeenCalledTimes(1);

    job.resolve();
    await draining;
  });

  it("never overlaps a maintenance task with itself, and a slow one does not hold up the others", async () => {
    const assembly = deferred();
    mocks.processUploadSessions.mockImplementationOnce(() => assembly.promise);
    const first = runMeetingMaintenanceTick(Date.now() + 20 * 60_000);
    // Lets the quick tasks of the first tick finish; the assembly is still running.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runMeetingMaintenanceTick(Date.now() + 30 * 60_000);
    expect(mocks.processUploadSessions).toHaveBeenCalledTimes(1);
    expect(mocks.reconcileCalls).toHaveBeenCalledTimes(2);

    assembly.resolve();
    await first;
    await runMeetingMaintenanceTick(Date.now() + 40 * 60_000);
    expect(mocks.processUploadSessions).toHaveBeenCalledTimes(2);
  });
});
