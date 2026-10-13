// The server POSTs to subscription endpoints, so only the browsers' push services are accepted.
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, other Chromium browsers
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, // Safari, iOS home-screen apps
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/, // Edge on Windows
];

export function isPushServiceEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && !url.username && !url.password
    && PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname));
}
