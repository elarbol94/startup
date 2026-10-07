import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));
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
import { meetingJobs, meetings } from "../schema";
import { resetDatabase, seedMeeting } from "../test-helpers";
import { cancelPendingJobs, claimNextJob, completeJob, enqueueJob, failJob, heartbeat, LEASE_MS, LeaseLostError, PermanentJobError } from "./jobs";

const T0 = 1_800_000_000_000;
let meetingId: string;

beforeEach(() => {
  resetDatabase();
  meetingId = seedMeeting().id;
});
afterAll(() => sqlite.close());

const enqueue = (key = "k1") => enqueueJob(db, { meetingId, stage: "merge", executionKey: key, policyRevision: 1 });
const row = (id: string) => db.select().from(meetingJobs).where(eq(meetingJobs.id, id)).get()!;

describe("meeting job queue", () => {
  it("enqueues once per execution key", () => {
    expect(enqueue()).not.toBeNull();
    expect(enqueue()).toBeNull();
    expect(db.select().from(meetingJobs).all()).toHaveLength(1);
  });

  it("claims with a fresh token and completes under the lease", () => {
    enqueue();
    const job = claimNextJob(T0)!;
    expect(job.status).toBe("running");
    expect(job.claimToken).toBeTruthy();
    expect(claimNextJob(T0 + 1)).toBeNull();
    const output = completeJob(job, () => "written", {}, T0 + 1000);
    expect(output).toBe("written");
    expect(row(job.id).status).toBe("done");
  });

  it("reclaims a job whose worker never returned, and discards the old worker's late completion", () => {
    enqueue();
    const first = claimNextJob(T0)!;
    const second = claimNextJob(T0 + LEASE_MS + 1)!;
    expect(second.id).toBe(first.id);
    expect(second.claimToken).not.toBe(first.claimToken);
    expect(second.attempts).toBe(2);
    const write = vi.fn();
    expect(() => completeJob(first, write, {}, T0 + LEASE_MS + 2)).toThrow(LeaseLostError);
    expect(write).not.toHaveBeenCalled();
    expect(heartbeat(first, T0 + LEASE_MS + 2)).toBe(false);
    expect(heartbeat(second, T0 + LEASE_MS + 2)).toBe(true);
  });

  it("discards a completion after the lease expired even when nobody reclaimed the job", () => {
    enqueue();
    const job = claimNextJob(T0)!;
    expect(() => completeJob(job, () => undefined, {}, T0 + LEASE_MS + 1)).toThrow(LeaseLostError);
    expect(row(job.id).status).toBe("running");
  });

  it("rolls back output when the meeting's AI policy changed meanwhile", () => {
    enqueue();
    const job = claimNextJob(T0)!;
    db.update(meetings).set({ policyRevision: 2 }).where(eq(meetings.id, meetingId)).run();
    expect(() => completeJob(job, () => undefined, { checkPolicy: true }, T0 + 1)).toThrow(LeaseLostError);
    expect(row(job.id).status).toBe("running");
  });

  it("rolls back the status change when the stage's writes fail", () => {
    enqueue();
    const job = claimNextJob(T0)!;
    expect(() => completeJob(job, () => { throw new Error("boom"); }, {}, T0 + 1)).toThrow("boom");
    expect(row(job.id).status).toBe("running");
  });

  it("retries with backoff, then fails; permanent errors fail at once", () => {
    enqueue("retry");
    let job = claimNextJob(T0)!;
    failJob(job, new Error("temporary"), T0);
    expect(row(job.id)).toMatchObject({ status: "queued", lastError: "temporary" });
    expect(row(job.id).nextAttemptAt.getTime()).toBeGreaterThan(T0);
    expect(claimNextJob(T0 + 1)).toBeNull();

    enqueue("permanent");
    job = claimNextJob(T0)!;
    failJob(job, new PermanentJobError("no audio"), T0);
    expect(row(job.id).status).toBe("failed");
  });

  it("cancels pending AI work so a running worker cannot commit", () => {
    enqueue();
    const job = claimNextJob(T0)!;
    cancelPendingJobs(db, meetingId, ["merge"]);
    expect(row(job.id).status).toBe("cancelled");
    expect(() => completeJob(job, () => undefined, {}, Date.now())).toThrow(LeaseLostError);
  });
});
