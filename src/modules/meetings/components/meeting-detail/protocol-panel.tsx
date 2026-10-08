"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Pencil, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveProtocol, regenerateProtocol } from "../../protocol-actions";
import { emptyProtocol, type ProtocolContent } from "../../protocol-content";
import type { MeetingDetail } from "../../queries";
import type { MeetingFormOptions } from "../new-meeting-dialog";
import { formatClock, useMeetingAction } from "../meeting-ui";
import { ActionItems } from "./action-items";
import { ProtocolEditor } from "./protocol-editor";
import { speakerName, speakerOrder } from "./transcript-panel";

type Segment = { id: string; startMs: number; speakerKey: string; text: string };

function Evidence({ ids, segments, nameOf }: { ids: string[]; segments: Map<string, Segment>; nameOf: (key: string) => string }) {
  const t = useTranslations("meetings");
  const found = ids.map((id) => segments.get(id)).filter((segment): segment is Segment => Boolean(segment));
  if (!found.length) return null;
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">{t("protocol.evidence", { count: found.length })}</summary>
      <ul className="mt-1 space-y-1 border-l pl-3">
        {found.map((segment) => (
          <li key={segment.id}><span className="font-mono tabular-nums">{formatClock(segment.startMs)}</span> {nameOf(segment.speakerKey)}: „{segment.text}“</li>
        ))}
      </ul>
    </details>
  );
}

function ProtocolView({ content, segments, nameOf, actionItems }: {
  content: ProtocolContent; segments: Map<string, Segment>; nameOf: (key: string) => string; actionItems: React.ReactNode;
}) {
  const t = useTranslations("meetings");
  const section = (title: string, children: React.ReactNode) => (
    <section className="space-y-2">
      <h3 className="font-medium">{title}</h3>
      {children}
    </section>
  );
  const list = (items: Array<{ key: string; text: string; evidence: string[] }>) => items.length
    ? <ul className="list-disc space-y-1.5 pl-5 text-sm">{items.map((item) => <li key={item.key}>{item.text}<Evidence ids={item.evidence} segments={segments} nameOf={nameOf} /></li>)}</ul>
    : <p className="text-sm text-muted-foreground">{t("protocol.nothing")}</p>;
  return (
    <div className="space-y-5">
      {content.summary && <p className="text-sm whitespace-pre-wrap">{content.summary}</p>}
      {section(t("protocol.agenda"), content.agendaItems.length ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {content.agendaItems.map((item) => (
            <li key={item.key}><span className="font-medium">{item.title}</span>{item.summary && <p className="whitespace-pre-wrap">{item.summary}</p>}<Evidence ids={item.evidence} segments={segments} nameOf={nameOf} /></li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted-foreground">{t("protocol.nothing")}</p>)}
      {section(t("protocol.decisions"), list(content.decisions))}
      {section(t("protocol.actionItems"), actionItems)}
      {section(t("protocol.openQuestions"), list(content.openQuestions))}
    </div>
  );
}

export function ProtocolPanel({ detail, options }: { detail: MeetingDetail; options: MeetingFormOptions }) {
  const t = useTranslations("meetings");
  const { pending, run } = useMeetingAction();
  const [editing, setEditing] = useState(false);
  const current = detail.currentProtocol;
  const approved = detail.approvedProtocol;
  const canContribute = detail.role !== "viewer";
  const canManage = detail.role === "host";
  const segments = useMemo(() => new Map<string, Segment>([
    ...(detail.transcript?.segments ?? []).map((segment) => [segment.id, segment] as const),
    ...detail.extraEvidence.map((segment) => [segment.id, segment] as const),
  ]), [detail.transcript, detail.extraEvidence]);
  const order = useMemo(() => speakerOrder(detail.transcript?.segments ?? [], detail.transcript?.fixedSpeakerKeys), [detail.transcript]);
  const nameOf = (key: string) => speakerName(key, detail.transcript?.speakerMap ?? {}, order, (index) => t("transcript.speaker", { number: index }));

  if (editing) {
    return (
      <ProtocolEditor
        meetingId={detail.meeting.id}
        baseProtocolId={current?.id ?? null}
        initial={current?.content ?? emptyProtocol()}
        members={detail.members}
        onClose={() => setEditing(false)}
      />
    );
  }

  if (!current) {
    const generating = detail.meeting.aiPolicy === "openai" && detail.recordings.length > 0;
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">{generating ? t("protocol.generating") : t("protocol.empty")}</p>
        {canContribute && <Button variant="outline" onClick={() => setEditing(true)}><Pencil />{t("protocol.writeManually")}</Button>}
      </div>
    );
  }

  const isApproved = approved?.id === current.id;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={isApproved ? "default" : "secondary"}>{isApproved ? t("protocol.approved") : t("protocol.draft")}</Badge>
          <span className="text-muted-foreground">{t("protocol.version", { version: current.version })} · {t(`protocol.source.${current.source}`)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canContribute && detail.meeting.aiPolicy === "openai" && detail.transcript && (
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => regenerateProtocol(detail.meeting.id))}><RefreshCw />{t("protocol.regenerate")}</Button>
          )}
          {canContribute && <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil />{t("protocol.edit")}</Button>}
          {canManage && !isApproved && (
            <Button size="sm" disabled={pending} onClick={() => run(() => approveProtocol({ meetingId: detail.meeting.id, protocolId: current.id }))}><CheckCircle2 />{t("protocol.approve")}</Button>
          )}
        </div>
      </div>
      {!isApproved && <p className="text-xs text-muted-foreground">{approved ? t("protocol.newerDraft", { version: approved.version }) : t("protocol.reviewHint")}</p>}
      <ProtocolView
        content={current.content}
        segments={segments}
        nameOf={nameOf}
        actionItems={isApproved
          ? <ActionItems detail={detail} protocolId={current.id} items={current.content.actionItems} options={options} />
          : current.content.actionItems.length
            ? <ul className="list-disc space-y-1.5 pl-5 text-sm">{current.content.actionItems.map((item) => <li key={item.itemKey}>{item.text}<Evidence ids={item.evidence} segments={segments} nameOf={nameOf} /></li>)}</ul>
            : <p className="text-sm text-muted-foreground">{t("protocol.nothing")}</p>}
      />
      {approved && !isApproved && (
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">{t("protocol.showApproved", { version: approved.version })}</summary>
          <div className="mt-3">
            <ProtocolView content={approved.content} segments={segments} nameOf={nameOf}
              actionItems={<ActionItems detail={detail} protocolId={approved.id} items={approved.content.actionItems} options={options} />} />
          </div>
        </details>
      )}
    </div>
  );
}
