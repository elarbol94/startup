import { expect, it } from "vitest";
import { isPushServiceEndpoint } from "./endpoint";

it("accepts browser push services and rejects everything else", () => {
  expect(isPushServiceEndpoint("https://fcm.googleapis.com/fcm/send/abc:def")).toBe(true);
  expect(isPushServiceEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
  expect(isPushServiceEndpoint("https://web.push.apple.com/QH4")).toBe(true);
  expect(isPushServiceEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x")).toBe(true);
  expect(isPushServiceEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
  expect(isPushServiceEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
  expect(isPushServiceEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
  expect(isPushServiceEndpoint("https://localhost/x")).toBe(false);
  expect(isPushServiceEndpoint("https://10.0.0.1/x")).toBe(false);
  expect(isPushServiceEndpoint("not a url")).toBe(false);
});
