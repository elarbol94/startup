import { describe, expect, it } from "vitest";
import { splitRatio, workspaceHref, restoreWorkspace, workspaceDestinationKey } from "./model";
describe("workspace destinations", () => {
  it("keeps deep links and query state inside the app", () => {
    expect(workspaceHref("/projects/project-0?view=knowledge#context", "https://app.test")).toBe("/projects/project-0?view=knowledge#context");
    expect(workspaceHref("/municipalities", "https://app.test")).toBe("/municipalities");
  });
  it("rejects external, executable and non-page destinations", () => {
    for (const href of ["https://other.test/wiki", "//other.test/wiki", "javascript:alert(1)", "/api/auth/sign-out", "/login", "/wiki-evil", "https://name:pass@app.test/wiki"])
      expect(workspaceHref(href, "https://app.test")).toBeNull();
  });
  it("keeps both panes usable when resized", () => {
    expect(splitRatio(0, 1100)).toBe(40);
    expect(splitRatio(100, 1100)).toBe(60);
    expect(splitRatio(50, 1500)).toBe(50);
  });
});

it("restores valid tabs but excludes untrusted destinations and invalid pairs", () => {
 const saved = restoreWorkspace(JSON.stringify({ tabs: [{id:"a",href:"/wiki/pages/test",title:"Note"},{id:"b",href:"https://other.test/wiki",title:"No"}],active:"missing",leftPane:"a",secondary:"a",split:true,ratio:100 }), "https://app.test");
 expect(saved?.tabs).toHaveLength(1);
 expect(saved).toMatchObject({active:"primary",leftPane:"a",secondary:null,split:false,ratio:70});
 expect(restoreWorkspace("invalid", "https://app.test")).toBeNull();
});

it("groups source passages without merging different task deep links", () => {
 expect(workspaceDestinationKey("/wiki/sources/source-1/read/pdf-2?page=3")).toBe(workspaceDestinationKey("/wiki/sources/source-1"));
 expect(workspaceDestinationKey("/projects/p?task=a")).not.toBe(workspaceDestinationKey("/projects/p?task=b"));
});
