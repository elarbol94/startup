"use client";

import { useTranslations } from "next-intl";
import { Info, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import type { Text } from "./personnel-copy";
import { Pill } from "./personnel-ui";

export function PersonnelHeader({ t }: { t: Text }) {
  const tAccounting = useTranslations("accountingShell");
  return <PageHeader
    eyebrow={tAccounting("eyebrow")}
    title={t.title}
    description={t.subtitle}
    actions={<>
      <Pill tone="outline"><Info />{t.planningAidShort}</Pill>
      <Pill tone="active" title={t.rules}><ShieldCheck />AT 2025–2027</Pill>
    </>}
  />;
}
