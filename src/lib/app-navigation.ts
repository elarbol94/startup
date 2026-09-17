export const APP_NAVIGATION_EVENT = "app:before-navigation";
export type AppNavigationRequest = { href: string; proceed: () => void };

/** Button-based navigation must give editors the same save opportunity as links. */
export function requestAppNavigation(href: string, proceed: () => void) {
  const event = new CustomEvent<AppNavigationRequest>(APP_NAVIGATION_EVENT, {
    cancelable: true,
    detail: { href, proceed },
  });
  if (window.dispatchEvent(event)) proceed();
}
