import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { testDocx, para } from "@/modules/wiki/office/test-docx";

const { getSession, createOfficePage } = vi.hoisted(() => ({ getSession: vi.fn(), createOfficePage: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("database used"); } }) }));
vi.mock("@/modules/wiki/lib/vector-store.server", () => ({ indexText: vi.fn(async () => {}), removeFromIndex: vi.fn() }));
vi.mock("@/modules/wiki/office/create", () => ({ createOfficePage }));

import { POST } from "./route";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function importRequest(file: File | Blob, init: { headers?: Record<string, string> } = {}) {
  const data = new FormData();
  data.set("file", file);
  data.set("locale", "en");
  return new Request("http://test/api/wiki/office/import", { method: "POST", body: data, headers: init.headers });
}

describe("POST /api/wiki/office/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user" } });
    createOfficePage.mockResolvedValue({ id: "page", slug: "bericht" });
  });

  it("imports a DOCX larger than the 1 MB server-action body limit", async () => {
    // Random bytes do not compress, so the archive stays above 1 MB.
    const docx = testDocx(para("Bericht"), { "word/media/padding.bin": randomBytes(1_200_000).toString("latin1") });
    expect(docx.byteLength).toBeGreaterThan(1024 * 1024);
    const response = await POST(importRequest(new File([new Uint8Array(docx)], "Bericht.docx", { type: DOCX_MIME })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slug: "bericht" });
    expect(createOfficePage).toHaveBeenCalledWith(expect.objectContaining({ title: "Bericht", locale: "en", parentId: null, kind: "import", userId: "user" }));
  });

  it("answers tooLarge for bodies over 50 MB without importing", async () => {
    const response = await POST(importRequest(new File([new Uint8Array(51 * 1024 * 1024)], "big.docx", { type: DOCX_MIME })));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "tooLarge" });
    expect(createOfficePage).not.toHaveBeenCalled();
  });

  it("rejects non-DOCX and broken DOCX files with their error codes", async () => {
    const pdf = await POST(importRequest(new File(["%PDF"], "a.pdf", { type: "application/pdf" })));
    expect(await pdf.json()).toEqual({ error: "notDocx" });
    const broken = await POST(importRequest(new File(["not a zip"], "a.docx", { type: DOCX_MIME })));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: "invalidDocx" });
    expect(createOfficePage).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated and cross-site requests", async () => {
    const file = new File([new Uint8Array(testDocx(para("x")))], "a.docx", { type: DOCX_MIME });
    expect((await POST(importRequest(file, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    getSession.mockResolvedValue(null);
    expect((await POST(importRequest(file))).status).toBe(401);
  });
});
