import { describe, expect, it } from "vitest";
import { absoluteShareUrl, htmlLink, markdownLink, plainShareText, shareTitle } from "./share-links";

const origin = "https://startup.example";

describe("absoluteShareUrl", () => {
  it("resolves in-app paths against the site", () => {
    expect(absoluteShareUrl("/projects/abc?task=t1", origin)).toBe("https://startup.example/projects/abc?task=t1");
    expect(absoluteShareUrl("/wiki/pages/plan#ziele", `${origin}/calendar`)).toBe("https://startup.example/wiki/pages/plan#ziele");
  });

  it("accepts absolute URLs on the same site", () => {
    expect(absoluteShareUrl("https://startup.example/time", origin)).toBe("https://startup.example/time");
  });

  it("refuses links to other sites", () => {
    expect(() => absoluteShareUrl("https://evil.example/", origin)).toThrow();
    expect(() => absoluteShareUrl("//evil.example/x", origin)).toThrow();
  });
});

describe("shareTitle", () => {
  it("collapses whitespace and falls back when empty", () => {
    expect(shareTitle("  Projekt\n  Alpha ", "Seite")).toBe("Projekt Alpha");
    expect(shareTitle("   ", "Seite")).toBe("Seite");
  });

  it("bounds long titles", () => {
    const title = shareTitle("x".repeat(400), "Seite");
    expect(title).toHaveLength(160);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("markdownLink", () => {
  it("escapes brackets in the title and parentheses in the URL", () => {
    expect(markdownLink("Plan [v2]", "https://startup.example/wiki/pages/plan_(v2)")).toBe(
      "[Plan \\[v2\\]](https://startup.example/wiki/pages/plan_%28v2%29)",
    );
  });
});

describe("htmlLink", () => {
  it("escapes markup", () => {
    expect(htmlLink('<b>"A" & B</b>', "https://startup.example/?a=1&b=2")).toBe(
      '<a href="https://startup.example/?a=1&#38;b=2">&#60;b&#62;&#34;A&#34; &#38; B&#60;/b&#62;</a>',
    );
  });
});

describe("plainShareText", () => {
  it("puts the link on its own line", () => {
    expect(plainShareText("Rechnung 2026-014", "https://startup.example/accounting/invoices/1")).toBe(
      "Rechnung 2026-014\nhttps://startup.example/accounting/invoices/1",
    );
  });
});
