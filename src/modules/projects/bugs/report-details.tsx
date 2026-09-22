"use client";
import { useEffect, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { getBugReportDetails } from "./actions";

export function BugReportDetails({ taskId, showDescription }: { taskId: string; showDescription?: boolean }) {
  const t = useTranslations("bugReports");
  const format = useFormatter();
  const [report, setReport] = useState<Awaited<ReturnType<typeof getBugReportDetails>>>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    getBugReportDetails(taskId).then(result => { if (alive) { setReport(result); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [taskId]);
  if (failed) return <p role="alert" className="text-sm text-destructive">{t("detailsFailed")}</p>;
  if (!report) return null;
  return <section className="space-y-2 rounded-md border bg-muted/25 p-3 text-sm">
    <h3 className="font-medium">{t("reportNumber", { number: report.number })}</h3>
    <p className="text-xs text-muted-foreground">{report.reporter} · {format.dateTime(new Date(report.createdAt), { dateStyle: "medium", timeStyle: "short" })}</p>
    {showDescription && <p className="whitespace-pre-wrap break-words">{report.description}</p>}
    <details className="text-xs"><summary className="cursor-pointer">{t("included")}</summary><dl className="mt-2 space-y-1 break-all"><dt>{t("page")}</dt><dd>{report.pagePath}</dd><dt>{t("version")}</dt><dd>{report.buildVersion}</dd><dt>{t("browser")}</dt><dd>{report.browser}</dd></dl></details>
    <div className="grid grid-cols-3 gap-2">{report.screenshots.filter(file => ["image/png", "image/jpeg", "image/webp"].includes(file.mimeType)).map(file => <a key={file.id} href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="min-w-0 rounded border p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/files/${file.id}`} alt={file.name} className="h-20 w-full object-contain" /><span className="block truncate text-xs">{file.name}</span>
    </a>)}</div>
  </section>;
}
