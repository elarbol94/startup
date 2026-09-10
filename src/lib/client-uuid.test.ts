import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { clientUUID } from "./client-uuid";
afterEach(() => vi.unstubAllGlobals());
it("keeps UUID validation compatible on HTTP without randomUUID", () => {
  const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  vi.stubGlobal("crypto", { getRandomValues });
  const first = clientUUID(), second = clientUUID();
  expect(z.string().uuid().parse(first)).toBe(first);
  expect(first[14]).toBe("4");
  expect(first).not.toBe(second);
});
it("uses native UUID generation when it is available", () => {
  const randomUUID = vi.fn(() => "d76fb6de-de31-4e32-9335-b8c7e048b210");
  vi.stubGlobal("crypto", { randomUUID });
  expect(clientUUID()).toBe(randomUUID.mock.results[0].value);
  expect(randomUUID).toHaveBeenCalledOnce();
});
