import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { identityVariable } from "@/lib/user-mark-colors";

vi.mock("@/modules/settings/identity-actions", () => ({ getUserIdentities: vi.fn() }));
import { UserIdentity, UserIdentityProvider, UserIdentities, UserIdentityStack } from "./user-identity";

function render(children: ReactNode) {
  const identityProps = {
    currentUserId: "alice",
    identities: [
      { id: "alice", name: "Same Name", markColor: "blue" },
      { id: "retained-bob", name: "Same Name", markColor: "rose" },
    ],
    children,
  };
  const intlProps = { locale: "en", messages, children: createElement(UserIdentityProvider, identityProps) };
  return renderToStaticMarkup(createElement(NextIntlClientProvider, intlProps));
}

describe("platform user attribution", () => {
  it("resolves historical accounts by ID even when names are identical", () => {
    const html = render(createElement(UserIdentity, { userId: "retained-bob" }));
    expect(html).toContain('data-user-id="retained-bob"');
    expect(html).toContain(`background-color:var(${identityVariable("retained-bob", "solid")}`);
    expect(html).toContain('title="Same Name"');
  });

  it("does not attribute unlinked employees or unknown IDs to the current user", () => {
    for (const userId of [null, "missing"]) {
      const html = render(createElement(UserIdentity, { userId, name: "Same Name" }));
      expect(html).not.toContain("background-color:");
      expect(html).not.toContain('data-user-id="alice"');
      expect(html).toContain('title="Same Name"');
    }
  });

  it("uses the current user only when no userId prop was supplied", () => {
    const html = render(createElement(UserIdentity, {}));
    expect(html).toContain('data-user-id="alice"');
    expect(html).toContain('title="Same Name"');
  });

  it("keeps every assignee visible and deduplicates repeated IDs", () => {
    const html = render(createElement(UserIdentities, { userIds: ["alice", "retained-bob", "alice"], compact: true }));
    expect(html.match(/data-user-id="alice"/g)).toHaveLength(1);
    expect(html.match(/data-user-id="retained-bob"/g)).toHaveLength(1);
  });

  it("summarises several people on one non-wrapping line for select triggers", () => {
    const people = [{ id: "alice", name: "Aaron" }, { id: "retained-bob", name: "Felix" }, { id: "alice", name: "Aaron" }];
    const html = render(createElement(UserIdentityStack, { people }));
    expect(html).toContain("flex-nowrap");
    expect(html).not.toContain("flex-wrap ");
    expect(html.match(/data-user-id="alice"/g)).toHaveLength(1);
    expect(html).toContain('<span class="truncate">Aaron, Felix</span>');
  });
});
