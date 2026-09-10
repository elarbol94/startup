import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./policy", async importOriginal => {
  const actual = await importOriginal<typeof import("./policy")>();
  return { ...actual, protectedTable: (name: string) => ["parent", "child"].includes(name) ? false : actual.protectedTable(name) };
});
import { installVersionJournal } from "./journal";
import { listVersions, previewRestore, restoreVersion, type Version } from "./store";
import { getTableName, is, Table } from "drizzle-orm";
import * as schema from "@/db/schema";

let sqlite: Database.Database;
const tables = Object.values(schema).filter(value => is(value, Table)).map(value => getTableName(value));
const versions = () => listVersions(sqlite, { table: "customers" });
function customer(name = "Original") { sqlite.prepare("INSERT INTO customers (id, name, created_at) VALUES ('customer', ?, 0)").run(name); }
function restore(version: Version, side: "before" | "after" = "before") {
  const preview = previewRestore(sqlite, version.id, side);
  return restoreVersion(sqlite, { id: version.id, side, token: preview.token, reason: "Correct accidental edit" }, "admin");
}
beforeEach(() => {
  sqlite = new Database(":memory:"); sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  installVersionJournal(sqlite, tables);
});
afterEach(() => sqlite.close());

describe("platform version history", () => {
  it("captures inserts, every update and deletions, including direct SQL", () => {
    customer(); sqlite.exec("UPDATE customers SET name='Second'; UPDATE customers SET name='Third'; DELETE FROM customers");
    expect(versions().map(row => row.operation)).toEqual(["delete", "update", "update", "insert"]);
    expect(JSON.parse(versions()[0].before_json!).name).toBe("Third");
    expect(JSON.parse(versions()[2].before_json!).name).toBe("Original");
  });
  it("does not record no-op writes or rolled-back transactions", () => {
    customer(); sqlite.exec("UPDATE customers SET name=name");
    expect(() => sqlite.transaction(() => { sqlite.exec("UPDATE customers SET name='Never saved'"); throw new Error("rollback"); })()).toThrow();
    expect(versions()).toHaveLength(1);
  });
  it("installs baselines once and refreshes triggers without losing nulls", () => {
    sqlite.exec("CREATE TABLE sample (id TEXT PRIMARY KEY, optional TEXT, value TEXT); INSERT INTO sample VALUES ('one', NULL, 'original')");
    installVersionJournal(sqlite, ["sample"]); installVersionJournal(sqlite, ["sample"]);
    expect(listVersions(sqlite, { table: "sample" })).toHaveLength(1);
    sqlite.exec("UPDATE sample SET value='edited'");
    expect(JSON.parse(listVersions(sqlite, { table: "sample" })[0].after_json!)).toEqual({ id: "one", optional: null, value: "edited" });
  });
  it("never captures credentials, public tokens, sessions or ephemeral collaboration", () => {
    const tracked = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'platform_version_%'").all() as { name: string }[];
    for (const name of ["account", "session", "verification", "user_invitations", "wiki_presentation_access", "wiki_collaboration_rooms", "wiki_collaboration_presence"]) {
      expect(tracked.some(row => row.name === `platform_version_${name}_insert`)).toBe(false);
    }
    expect(tracked.length).toBeGreaterThan(200);
  });
  it("records composite keys and cascading deletions independently of their parent", () => {
    sqlite.exec("CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (parent_id TEXT REFERENCES parent(id) ON DELETE CASCADE, name TEXT, PRIMARY KEY(parent_id,name))");
    installVersionJournal(sqlite, ["parent", "child"]);
    sqlite.exec("INSERT INTO parent VALUES ('one'); INSERT INTO child VALUES ('one','two'); DELETE FROM parent");
    const deleted = listVersions(sqlite, { table: "child" })[0];
    expect(deleted.operation).toBe("delete"); expect(JSON.parse(deleted.record_key)).toEqual({ parent_id: "one", name: "two" });
    expect(() => restore(deleted)).toThrow("dependencies");
    restore(listVersions(sqlite, { table: "parent" })[0]); restore(deleted);
    expect(sqlite.prepare("SELECT count(*) AS n FROM child").get()).toEqual({ n: 1 });
  });
  it("restores as a new version with an audit record and allows undoing the restore", () => {
    customer(); sqlite.exec("UPDATE customers SET name='Accident'");
    restore(versions()[0]);
    expect(sqlite.prepare("SELECT name FROM customers").get()).toEqual({ name: "Original" });
    expect(versions()).toHaveLength(3);
    expect(sqlite.prepare("SELECT actor_id, reason FROM platform_restores").get()).toEqual({ actor_id: "admin", reason: "Correct accidental edit" });
    restore(versions()[0]);
    expect(sqlite.prepare("SELECT name FROM customers").get()).toEqual({ name: "Accident" });
  });
  it("rejects a stale preview even when a later edit returns to the same value", () => {
    customer(); sqlite.exec("UPDATE customers SET name='Accident'");
    const version = versions()[0]; const preview = previewRestore(sqlite, version.id, "before");
    sqlite.exec("UPDATE customers SET name='Concurrent'; UPDATE customers SET name='Accident'");
    expect(() => restoreVersion(sqlite, { id: version.id, side: "before", token: preview.token, reason: "Restore old" }, "admin")).toThrow("conflict");
    expect(sqlite.prepare("SELECT count(*) AS n FROM platform_restores").get()).toEqual({ n: 0 });
  });
  it("recovers deleted records and rolls back a failed dependent restore", () => {
    customer(); sqlite.exec("DELETE FROM customers"); restore(versions()[0]);
    expect(sqlite.prepare("SELECT name FROM customers").get()).toEqual({ name: "Original" });
    sqlite.exec("UPDATE customers SET name='Accident'"); const version = versions()[0]; const preview = previewRestore(sqlite, version.id, "before"); const count = versions().length;
    expect(() => restoreVersion(sqlite, { id: version.id, side: "before", token: preview.token, reason: "Restore old" }, "admin", () => { sqlite.exec("UPDATE customers SET name='Partial'"); throw new Error("failed hook"); })).toThrow("failed hook");
    expect(versions()).toHaveLength(count);
    expect(sqlite.prepare("SELECT name FROM customers").get()).toEqual({ name: "Accident" });
  });
  it("blocks incompatible old schemas and protected accounting changes", () => {
    customer(); sqlite.exec("UPDATE customers SET name='Accident'"); const version = versions()[0];
    sqlite.exec("ALTER TABLE customers ADD COLUMN extra TEXT");
    expect(previewRestore(sqlite, version.id, "before").problem).toBe("schemaChanged");
    sqlite.exec("INSERT INTO platform_versions (table_name, record_key, operation, before_json, after_json, created_at) VALUES ('entries', '{\"id\":\"entry\"}', 'delete', '{\"id\":\"entry\"}', NULL, 1)");
    expect(previewRestore(sqlite, listVersions(sqlite, { table: "entries" })[0].id, "before").problem).toBe("protected");
  });
  it("rejects a restore that would introduce a parent cycle", () => {
    sqlite.exec("CREATE TABLE parent (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES parent(id), name TEXT)");
    installVersionJournal(sqlite, ["parent"]);
    sqlite.exec("INSERT INTO parent VALUES ('a',NULL,'A'); INSERT INTO parent VALUES ('b','a','B'); UPDATE parent SET parent_id=NULL WHERE id='b'");
    const version = listVersions(sqlite, { table: "parent" })[0];
    sqlite.exec("UPDATE parent SET parent_id='b' WHERE id='a'");
    expect(() => restore(version)).toThrow("dependencies");
    expect(sqlite.prepare("SELECT parent_id FROM parent WHERE id='b'").get()).toEqual({ parent_id: null });
  });
  it("keeps snapshots downloadable after a table is removed", () => {
    customer(); const version = versions()[0]; sqlite.exec("DROP TABLE customers");
    const preview = previewRestore(sqlite, version.id, "after");
    expect(preview.problem).toBe("schemaChanged"); expect(preview.target?.name).toBe("Original");
  });
  it("captures future tables while requiring an explicit restoration policy", () => {
    sqlite.exec("CREATE TABLE future_workflow (id TEXT PRIMARY KEY, name TEXT)");
    installVersionJournal(sqlite, ["future_workflow"]);
    sqlite.exec("INSERT INTO future_workflow VALUES ('a','Original'); UPDATE future_workflow SET name='Changed'");
    const version = listVersions(sqlite, { table: "future_workflow" })[0];
    expect(previewRestore(sqlite, version.id, "before").problem).toBe("protected");
  });
  it("keeps pagination bounded and treats search wildcards literally", () => {
    customer("100% ready");
    for (let index = 0; index < 60; index++) sqlite.prepare("UPDATE customers SET name=?").run(`Edit ${index}`);
    expect(versions()).toHaveLength(51);
    const first = versions(); const next = listVersions(sqlite, { table: "customers", before: first.at(-1)!.id });
    expect(next.every(row => row.id < first.at(-1)!.id)).toBe(true);
    expect(listVersions(sqlite, { query: "%" })).toHaveLength(2);
  });
});
