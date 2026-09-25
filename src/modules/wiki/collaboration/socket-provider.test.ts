import { expect, it } from "vitest";
import { SocketCollaborationProvider } from "./socket-provider";

// Listeners run React and ProseMirror code. Calling them from inside a Yjs
// transaction re-entered the editor on every keystroke and could loop.
it("notifies listeners after the transaction and only when the status changed", async () => {
  const provider = new SocketCollaborationProvider("page", "notify-test");
  let calls = 0;
  provider.subscribe(() => { calls++; });
  provider.doc.getText("t").insert(0, "a");
  expect(calls).toBe(0);
  await Promise.resolve();
  expect(calls).toBe(1);
  for (let index = 0; index < 20; index++) provider.doc.getText("t").insert(0, "b");
  await Promise.resolve();
  expect(calls).toBe(1);
});
