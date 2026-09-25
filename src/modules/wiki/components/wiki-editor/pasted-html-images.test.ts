import { describe, expect, it, vi } from "vitest";
import { acceptPastedImage, collectPastedImages, dataUriToFile, PASTED_IMAGE_MAX_BYTES, pastedImageKind, pastedImageToFile } from "./pasted-html-images";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function response(body: BlobPart, type: string, init: ResponseInit = {}) {
  return new Response(new Blob([body], { type }), { status: 200, headers: { "content-type": type }, ...init });
}

describe("pastedImageKind", () => {
  it("classifies the sources the browser can read", () => {
    expect(pastedImageKind(`data:image/png;base64,${PNG}`)).toBe("data");
    expect(pastedImageKind("blob:https://example.com/0f3c")).toBe("blob");
    expect(pastedImageKind("https://example.com/a.png")).toBe("remote");
  });

  it("rejects local files, plain http, relative paths and non-image data", () => {
    for (const src of ["file:///C:/Users/a.png", "http://example.com/a.png", "/api/files/abc", "", "data:text/html,<b>x</b>", "javascript:alert(1)"]) {
      expect(pastedImageKind(src)).toBe("unsupported");
    }
  });
});

describe("dataUriToFile", () => {
  it("decodes base64 image data with its type and a matching extension", async () => {
    const file = dataUriToFile(`data:image/png;base64,${PNG}`, "pasted-image-1.img")!;
    expect(file.type).toBe("image/png");
    expect(file.name).toBe("pasted-image-1.png");
    const bytes = new Uint8Array(await file.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((byte) => String.fromCharCode(byte)).join("")).toBe("PNG");
  });

  it("decodes percent-encoded SVG", async () => {
    const file = dataUriToFile("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E", "pasted-image-2.img")!;
    expect(file.type).toBe("image/svg+xml");
    expect(file.name).toBe("pasted-image-2.svg");
    expect(await file.text()).toBe('<svg xmlns="http://www.w3.org/2000/svg"/>');
  });

  it("returns null for malformed data", () => {
    expect(dataUriToFile("data:image/png;base64,@@@", "x.img")).toBeNull();
    expect(dataUriToFile("not a data uri", "x.img")).toBeNull();
  });
});

describe("acceptPastedImage", () => {
  it("keeps only allowed image types within the size limit", () => {
    expect(acceptPastedImage(new File(["x"], "a.png", { type: "image/png" }))).not.toBeNull();
    expect(acceptPastedImage(new File(["x"], "a.gif", { type: "image/gif" }))).toBeNull();
    expect(acceptPastedImage(new File([], "a.png", { type: "image/png" }))).toBeNull();
    const huge = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: PASTED_IMAGE_MAX_BYTES + 1 });
    expect(acceptPastedImage(huge)).toBeNull();
    expect(acceptPastedImage(null)).toBeNull();
  });
});

describe("pastedImageToFile", () => {
  it("fetches remote images as a credential-less CORS request", async () => {
    const fetcher = vi.fn(async () => response("png-bytes", "image/png"));
    const file = await pastedImageToFile("https://example.com/chart.png", 2, fetcher as unknown as typeof fetch);
    expect(file?.name).toBe("pasted-image-3.png");
    expect(file?.type).toBe("image/png");
    expect(fetcher).toHaveBeenCalledWith("https://example.com/chart.png", expect.objectContaining({ mode: "cors", credentials: "omit" }));
  });

  it("returns null when the remote image cannot be read", async () => {
    const blocked = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect(await pastedImageToFile("https://example.com/a.png", 0, blocked as unknown as typeof fetch)).toBeNull();
    const missing = vi.fn(async () => new Response("", { status: 404 }));
    expect(await pastedImageToFile("https://example.com/a.png", 0, missing as unknown as typeof fetch)).toBeNull();
    const notImage = vi.fn(async () => response("<html>", "text/html"));
    expect(await pastedImageToFile("https://example.com/a.png", 0, notImage as unknown as typeof fetch)).toBeNull();
  });

  it("never fetches unsupported sources", async () => {
    const fetcher = vi.fn();
    expect(await pastedImageToFile("file:///tmp/a.png", 0, fetcher as unknown as typeof fetch)).toBeNull();
    expect(await pastedImageToFile("http://10.0.0.1/a.png", 0, fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("collectPastedImages", () => {
  it("keeps the original order and counts skipped images", async () => {
    const fetcher = vi.fn(async () => response("jpeg-bytes", "image/jpeg"));
    const { files, skipped } = await collectPastedImages([
      "https://example.com/first.jpg",
      "file:///C:/second.png",
      `data:image/png;base64,${PNG}`,
    ], fetcher as unknown as typeof fetch);
    expect(files.map((file) => file.name)).toEqual(["pasted-image-1.jpg", "pasted-image-3.png"]);
    expect(skipped).toBe(1);
  });
});
