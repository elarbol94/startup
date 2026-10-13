import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { brandInitials } from "@/components/app-sidebar/sidebar-model";
import { getAppSettings } from "@/modules/settings/queries";

// Design 1b brand teal, oklch(0.52 0.09 185), as sRGB for the PNG renderer.
const BRAND = "#087970";

const variants = {
  "192": { size: 192, maskable: false, badge: false },
  "512": { size: 512, maskable: false, badge: false },
  maskable: { size: 512, maskable: true, badge: false },
  apple: { size: 180, maskable: true, badge: false },
  // Android tints the status-bar badge itself and only uses its alpha channel.
  badge: { size: 96, maskable: false, badge: true },
} as const;

/** App icons for the manifest and notifications: the sidebar brand initials on brand teal. */
export async function GET(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  await connection();
  const { variant } = await params;
  const spec = variants[variant as keyof typeof variants];
  if (!spec) return new Response("Not found", { status: 404 });
  const common = await getTranslations("common");
  const initials = brandInitials(getAppSettings().companyName.trim() || common("appName"));
  const { size } = spec;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: spec.badge ? "transparent" : BRAND,
          // Maskable icons fill the canvas; the launcher applies its own shape.
          borderRadius: spec.maskable || spec.badge ? 0 : size * 0.22,
          color: "#ffffff",
          fontSize: size * (spec.maskable ? 0.34 : spec.badge ? 0.5 : 0.42),
          fontWeight: 700,
          letterSpacing: -size * 0.01,
        }}
      >
        {initials}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
