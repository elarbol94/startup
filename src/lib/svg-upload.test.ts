import { describe, expect, it } from "vitest";
import { isSafeInlineSvg } from "./svg-upload";

const bytes = (value: string) => new TextEncoder().encode(value);

describe("SVG upload validation", () => {
  it("accepts self-contained vector artwork", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0h20v20H0z" fill="#315efb"/></svg>'))).toBe(true);
  });

  it("rejects active markup and remote resources", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBe(false);
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/pixel.png"/></svg>'))).toBe(false);
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="alert(1)"/></svg>'))).toBe(false);
  });

  it("rejects a namespace-prefixed script tag", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg" xmlns:a="http://www.w3.org/1999/xhtml"><a:script>alert(1)</a:script></svg>'))).toBe(false);
  });

  it("rejects SMIL animations that could redirect href to javascript:", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><a href="#"><animate attributeName="href" to="javascript:alert(1)"/></a></svg>'))).toBe(false);
  });

  it("rejects XHTML breakout and escaped or entity-encoded CSS resources", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><div xmlns="http://www.w3.org/1999/xhtml"><form action="javascript:alert(1)"><button>Edit</button></form></div></svg>'))).toBe(false);
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:u\\72l(https://evil.example/x)"/></svg>'))).toBe(false);
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:image-set(\'https://evil.example/x\' 1x)"/></svg>'))).toBe(false);
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="&#117;rl(https://evil.example/x)"/></svg>'))).toBe(false);
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><rect/>'))).toBe(false);
  });

  it("rejects HTML tag names inside the SVG namespace", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg"><div><form action="#"><button>Edit</button></form></div></svg>'))).toBe(false);
  });

  it("accepts Inkscape editor metadata", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" inkscape:export-filename="C:\\Users\\me\\a.png"><sodipodi:namedview id="n"/><metadata><rdf:RDF/></metadata><path d="M0 0h1"/></svg>'))).toBe(true);
  });

  it("still accepts namespaced, gradient-referencing artwork", () => {
    expect(isSafeInlineSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect fill="url(#g)"/><use xlink:href="#g"/><text>a &amp; b</text></svg>'))).toBe(true);
  });
});
