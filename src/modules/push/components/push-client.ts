// Browser-side Web Push helpers shared by the settings card and the app-wide registrar.
import { removePushSubscription } from "../actions";

export type PushSupport = "unsupported" | "denied" | "available";

export function browserPushSupport(): PushSupport {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  return Notification.permission === "denied" ? "denied" : "available";
}

export function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

function keyBytes(base64Url: string) {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, publicKey: string) {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = keyBytes(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

/** The browser's current subscription for this app, or null when the device is not subscribed. */
export async function currentSubscription() {
  const registration = await registerServiceWorker();
  return registration.pushManager.getSubscription();
}

/**
 * Subscribes this device with the server's VAPID key. A subscription made with an
 * older key (rotated on the server) is replaced, because push services reject it.
 */
export async function subscribeDevice(publicKey: string) {
  const registration = await registerServiceWorker();
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing && sameKey(existing, publicKey)) return existing;
  await existing?.unsubscribe();
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
}

export function subscriptionInput(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } };
}

/** Detaches this device from the signed-in user on the server; the browser keeps its subscription. */
export async function unbindPushDevice() {
  try {
    if (browserPushSupport() === "unsupported") return;
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await removePushSubscription(subscription.endpoint);
  } catch {
    // Signing out must not depend on push.
  }
}
