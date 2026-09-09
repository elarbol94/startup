export const presentationPaletteIds = ["original", "ocean", "forest", "sunset", "plum", "slate"] as const;
export type PresentationPaletteId = (typeof presentationPaletteIds)[number];
export type TemplatePalette = {
  paper: string; ink: string; muted: string; accent: string; soft: string;
  cover: string; coverInk: string; secondary: string; strong: string; connector: string;
};
export const presentationPalettes: Record<Exclude<PresentationPaletteId, "original">, TemplatePalette> = {
  ocean: { paper: "#f4f8ff", ink: "#183454", muted: "#526780", accent: "#245f9c", soft: "#dfeafa", cover: "#183454", coverInk: "#f4f8ff", secondary: "#e7e1f5", strong: "#bcd4ef", connector: "#527da8" },
  forest: { paper: "#f5faf5", ink: "#233e2b", muted: "#566d59", accent: "#356c44", soft: "#e0eddf", cover: "#233e2b", coverInk: "#f5faf5", secondary: "#eee8d5", strong: "#c0d9bb", connector: "#618766" },
  sunset: { paper: "#fff8f2", ink: "#542d26", muted: "#795d53", accent: "#a4422a", soft: "#f5e1d5", cover: "#542d26", coverInk: "#fff8f2", secondary: "#f3eacb", strong: "#edc2ae", connector: "#ad7560" },
  plum: { paper: "#fbf7ff", ink: "#422c54", muted: "#705c7c", accent: "#79458f", soft: "#eee1f5", cover: "#422c54", coverInk: "#fbf7ff", secondary: "#f3e0e6", strong: "#d9bce8", connector: "#92739f" },
  slate: { paper: "#f8fafc", ink: "#243244", muted: "#596778", accent: "#425c79", soft: "#e4e9ef", cover: "#243244", coverInk: "#f8fafc", secondary: "#ede7df", strong: "#c7d2df", connector: "#75869a" },
};
