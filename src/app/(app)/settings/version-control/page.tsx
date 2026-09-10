import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getFormatter, getTranslations } from "next-intl/server";
import { getVersionHistory } from "@/modules/settings/version-control/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { VersionDialog } from "./version-dialog";

export default async function VersionControlPage({ searchParams }: { searchParams: Promise<{ table?: string; before?: string; q?: string }> }) {
  if ((await requireUser()).role !== "admin") redirect("/settings/profile");
  const params = await searchParams;
  const before = Number(params.before);
  const table = typeof params.table === "string" ? params.table.slice(0, 120) : "";
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const history = await getVersionHistory({ table, query, before: Number.isSafeInteger(before) && before > 0 ? before : undefined });
  const t = await getTranslations("settings.versionControl");
  const format = await getFormatter();
  const next = new URLSearchParams({ table, q: query, before: String(history.rows.at(-1)?.id ?? "") });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
          <p>{t("coverage")}</p>
          <p>{t("protection")}</p>
          {history.since && <p className="text-muted-foreground">{t("since", { date: format.dateTime(new Date(history.since), { dateStyle: "medium", timeStyle: "short" }) })}</p>}
        </div>
        <form className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm flex-1 min-w-48">{t("search")}<Input name="q" defaultValue={query} maxLength={200} placeholder={t("searchPlaceholder")} /></label>
          <label className="grid gap-1 text-sm">{t("area")}
            <select name="table" defaultValue={table} className="h-9 max-w-full rounded-md border bg-background px-3">
              <option value="">{t("allAreas")}</option>
              {history.tables.map(name => <option key={name} value={name}>{t.has(`tables.${name}`) ? t(`tables.${name}`) : name.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <Button type="submit" variant="outline">{t("filter")}</Button>
          <Link href="/settings/version-control" className="text-sm underline py-2">{t("latest")}</Link>
        </form>
        {!history.rows.length && <p className="rounded-lg border border-dashed p-6 text-muted-foreground">{t("empty")}</p>}
        <ol className="divide-y">
          {history.rows.map(row => {
            const snapshot = JSON.parse(row.after_json ?? row.before_json ?? "{}") as Record<string, unknown>;
            const title = String(snapshot.title ?? snapshot.name ?? snapshot.file_name ?? snapshot.company_name ?? Object.values(JSON.parse(row.record_key)).join(" · "));
            return <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate" title={title}>{title}</p>
                <p className="text-sm text-muted-foreground">{t.has(`tables.${row.table_name}`) ? t(`tables.${row.table_name}`) : row.table_name.replaceAll("_", " ")} · {t(`operations.${row.operation}`)} · #{row.id}</p>
                {row.restore_reason && <p className="text-sm text-muted-foreground">{t("restoreReason", { reason: row.restore_reason })}</p>}
                <time className="text-xs text-muted-foreground" dateTime={new Date(row.created_at).toISOString()}>{format.dateTime(new Date(row.created_at), { dateStyle: "medium", timeStyle: "medium" })}</time>
              </div>
              <VersionDialog id={row.id} title={title} hasBefore={row.before_json !== null} hasAfter={row.after_json !== null} />
            </li>;
          })}
        </ol>
        {history.hasMore && <Link className="inline-flex rounded-md border px-4 py-2 text-sm" href={`/settings/version-control?${next}`}>{t("older")}</Link>}
      </CardContent>
    </Card>
  );
}
