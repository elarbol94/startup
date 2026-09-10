import { describe, expect, it } from "vitest";
import {
  canonicalEntityHref,
  canonicalTaskHref,
  withTaskFocus,
  withWorkItemFocus,
} from "./routes";

describe("context routes", () => {
  it("builds canonical task destinations for project and personal tasks", () => {
    expect(canonicalTaskHref("task / one", "project one")).toBe(
      "/projects/project%20one?task=task%20%2F%20one",
    );
    expect(canonicalTaskHref("personal task", null)).toBe(
      "/?task=personal%20task",
    );
  });

  it("builds canonical wiki, source and PDF destinations", () => {
    expect(
      canonicalEntityHref("wikiPage", "page-id", { slug: "project brief" }),
    ).toBe("/wiki/pages/project%20brief");
    expect(canonicalEntityHref("wikiSource", "source/id")).toBe(
      "/wiki/sources/source%2Fid",
    );
    expect(
      canonicalEntityHref("pdf", "document-id", {
        sourceId: "source-id",
        pageNumber: 6,
      }),
    ).toBe("/wiki/sources/source-id/read/document-id?page=6");
  });

  it("preserves existing query parameters when focusing a task at its origin", () => {
    expect(withTaskFocus("/wiki/pages/brief", "task one")).toBe(
      "/wiki/pages/brief?task=task%20one",
    );
    expect(withTaskFocus("/wiki/source/read/pdf?page=6", "task one")).toBe(
      "/wiki/source/read/pdf?page=6&task=task%20one",
    );
  });
});

describe("overview origin navigation", () => {
  it("keeps PDF pages and fragment anchors before adding focus", () => {
    expect(withWorkItemFocus("/wiki/sources/source/read/pdf?page=6#selection", "deadline one", "deadline"))
      .toBe("/wiki/sources/source/read/pdf?page=6&deadline=deadline%20one#selection");
  });
  it("replaces stale task and deadline focus without losing section filters", () => {
    expect(withWorkItemFocus("/calendar?view=week&task=old&deadline=older#day", "new", "task"))
      .toBe("/calendar?view=week&task=new#day");
  });
  it("keeps fragment-only origins usable", () => {
    expect(withTaskFocus("/wiki/pages/brief#notes", "one")).toBe("/wiki/pages/brief?task=one#notes");
  });
  it.each(["https://example.com", "//example.com", "/\\\\example.com"])("keeps invalid origin %s within the app", (route) => {
    expect(withWorkItemFocus(route, "one", "task")).toBe("/?task=one");
  });
});
