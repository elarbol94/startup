import { getTranslations } from "next-intl/server";
import { MapPinned } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { MunicipalityAnalysisPersistenceProvider } from "@/modules/municipalities/components/municipality-analysis-persistence-provider";
import { MunicipalitiesSubnav } from "@/modules/municipalities/components/municipalities-subnav";

export default async function MunicipalitiesLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const t = await getTranslations("municipalities");
  return (
    <MunicipalityAnalysisPersistenceProvider>
    {/* The analysis editor is a canvas, not a document: from lg on it takes the rest of
        the viewport instead of sitting in a fixed box the page scrolls past. Expressed the
        same way the app shell handles project focus mode — a :has() rule — so the overview
        and the analysis landing page keep their normal flow height. */}
    <style>{`
      @media (min-width: 1024px) {
        [data-municipalities-shell]:has([data-analysis-editor]) {
          height: calc(100dvh - 3rem);
        }
        [data-municipalities-shell]:has([data-analysis-editor]) > [data-municipalities-body] {
          flex: 1;
          min-height: 0;
        }
      }
    `}</style>
    <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-2 sm:gap-4" data-municipalities-shell>
      <PageHeader
        className="mb-0 sm:items-center"
        icon={<MapPinned />}
        title={t("title")}
        description={t("description")}
        actions={<MunicipalitiesSubnav />}
      />
      <div className="min-w-0" data-municipalities-body>{children}</div>
    </div>
    </MunicipalityAnalysisPersistenceProvider>
  );
}
