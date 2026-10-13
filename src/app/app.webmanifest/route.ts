import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAppSettings } from "@/modules/settings/queries";

// Served as a route instead of app/manifest.ts so the root layout can link it with
// crossOrigin="use-credentials": behind Cloudflare Access a manifest fetched without
// cookies is redirected to the login page and the app installs as a plain bookmark.
export async function GET() {
  await connection();
  const common = await getTranslations("common");
  const name = getAppSettings().companyName.trim() || common("appName");
  const manifest: MetadataRoute.Manifest = {
    id: "/",
    name,
    short_name: name.length > 12 ? common("appShortName") : name,
    description: common("appDescription"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7f6",
    theme_color: "#087970",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" },
  });
}
