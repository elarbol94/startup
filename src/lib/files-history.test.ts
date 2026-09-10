import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, expect, it, vi } from "vitest";
const temp = vi.hoisted(() => { const directory = `/tmp/management-attachment-history-${process.pid}`; process.env.UPLOADS_PATH = directory; return directory; });
vi.mock("@/db", () => ({ db: {} }));
import { recoverAttachmentVersion, retainAttachmentVersion } from "./files";
afterAll(() => { fs.rmSync(temp, { recursive: true, force: true }); delete process.env.UPLOADS_PATH; });
it("preserves deleted/overwritten bytes, verifies hashes and recovers to an independent path", () => {
  const bytes = Buffer.from("original attachment"); const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const storedName = "aa/original.txt"; const absolute = path.join(temp, storedName);
  fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, bytes);
  retainAttachmentVersion({ storedName, sha256 });
  fs.writeFileSync(absolute, "replacement");
  const recovered = recoverAttachmentVersion(storedName, sha256)!;
  expect(recovered).not.toBe(storedName); expect(fs.readFileSync(path.join(temp, recovered))).toEqual(bytes);
  expect(fs.readFileSync(absolute, "utf8")).toBe("replacement");
  fs.unlinkSync(absolute);
  expect(recoverAttachmentVersion(storedName, sha256)).toBeTruthy();
});
it("rejects missing/corrupt historical files and traversal paths", () => {
  const sha256 = "b".repeat(64);
  fs.mkdirSync(path.join(temp, ".history"), { recursive: true }); fs.writeFileSync(path.join(temp, ".history", sha256), "corrupt");
  expect(recoverAttachmentVersion("aa/missing.txt", sha256)).toBeNull();
  expect(recoverAttachmentVersion("../outside", sha256)).toBeNull();
  expect(recoverAttachmentVersion(path.join(os.tmpdir(), "outside"), sha256)).toBeNull();
});
