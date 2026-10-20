// Image geometry shared by .pptx import and export: intrinsic size sniffing and the
// mapping between PowerPoint's `srcRect` crop and the canvas' fit/cropX/cropY/zoom.
import type { PresentationImageElement } from "./presentation";

type ImageContent = PresentationImageElement["content"];
export type PptxSrcRect = { l: number; t: number; r: number; b: number };

/** Pixel size from the PNG, GIF, JPEG or WebP header; null for anything else. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
  const valid = (width: number, height: number) => width > 0 && height > 0 ? { width, height } : null;
  try {
    if (bytes.length >= 24 && ascii(1, 3) === "PNG") return valid(view.getUint32(16), view.getUint32(20));
    if (bytes.length >= 10 && ascii(0, 3) === "GIF") return valid(view.getUint16(6, true), view.getUint16(8, true));
    if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
      const chunk = ascii(12, 4);
      if (chunk === "VP8 ") return valid(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
      if (chunk === "VP8L") { const bits = view.getUint32(21, true); return valid((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1); }
      if (chunk === "VP8X") return valid(1 + (bytes[24] | bytes[25] << 8 | bytes[26] << 16), 1 + (bytes[27] | bytes[28] << 8 | bytes[29] << 16));
      return null;
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return valid(view.getUint16(offset + 7), view.getUint16(offset + 5));
        offset += 2 + view.getUint16(offset + 2);
      }
    }
  } catch { return null; }
  return null;
}

/**
 * Where the visible part of an image sits inside its element box (px, relative to the box)
 * and which part of the image it shows, reproducing the canvas' CSS: `object-fit`,
 * `object-position: cropX% cropY%` and `scale(zoom)` around that same point.
 */
export function imagePlacement(box: { width: number; height: number }, content: ImageContent, natural: { width: number; height: number } | null) {
  const { width: W, height: H } = box;
  const iw = natural?.width ?? W, ih = natural?.height ?? H;
  const fit = content.fit ?? "contain", zoom = content.zoom ?? 1;
  const px = (content.cropX ?? 50) / 100, py = (content.cropY ?? 50) / 100;
  const scale = fit === "cover" ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
  const w0 = iw * scale, h0 = ih * scale;
  const ax = px * W, ay = py * H;
  const x0 = ax + ((W - w0) * px - ax) * zoom, y0 = ay + ((H - h0) * py - ay) * zoom;
  const w = w0 * zoom, h = h0 * zoom;
  const left = Math.max(0, x0), top = Math.max(0, y0), right = Math.min(W, x0 + w), bottom = Math.min(H, y0 + h);
  if (right <= left || bottom <= top) return null;
  const crop: PptxSrcRect = { l: (left - x0) / w, t: (top - y0) / h, r: (x0 + w - right) / w, b: (y0 + h - bottom) / h };
  return { x: left, y: top, width: right - left, height: bottom - top, crop };
}

/**
 * PowerPoint stretches the cropped part of the picture over the shape. With `cover` and a
 * zoom that shows exactly the cropped fraction, the canvas shows the same region whenever
 * the box has the cropped region's aspect ratio, which is the normal case for a crop.
 * Percentages (0–100) as pptxtojson reports them; negative (padding) values count as 0.
 */
export function srcRectToImageCrop(rect: Partial<PptxSrcRect> | undefined): Pick<ImageContent, "fit" | "cropX" | "cropY" | "zoom"> | null {
  const part = (value?: number) => Math.max(0, Math.min(100, Number(value) || 0)) / 100;
  const l = part(rect?.l), t = part(rect?.t), r = part(rect?.r), b = part(rect?.b);
  if (!(l || t || r || b)) return null;
  const visibleX = Math.max(0.01, 1 - l - r), visibleY = Math.max(0.01, 1 - t - b);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    fit: "cover",
    zoom: round(Math.min(5, Math.max(1, 1 / Math.max(visibleX, visibleY)))),
    cropX: round(l + r > 0 ? (l / (l + r)) * 100 : 50),
    cropY: round(t + b > 0 ? (t / (t + b)) * 100 : 50),
  };
}
