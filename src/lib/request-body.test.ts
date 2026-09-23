import { expect, it } from "vitest";
import { limitedRequest } from "./request-body";

function chunked(bytes: number) {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } });
  return new Request("http://x/upload", { method: "POST", body, duplex: "half" } as RequestInit);
}

it("counts streamed bytes even without Content-Length", async () => {
  expect(await limitedRequest(chunked(11), 10)).toBeNull();
  const bounded = await limitedRequest(chunked(10), 10);
  expect((await bounded!.arrayBuffer()).byteLength).toBe(10);
});

it("keeps form bodies replayable", async () => {
  const form = new FormData();
  form.set("name", "value");
  const bounded = await limitedRequest(new Request("http://x/upload", { method: "POST", body: form }), 1024);
  expect((await bounded!.formData()).get("name")).toBe("value");
});
