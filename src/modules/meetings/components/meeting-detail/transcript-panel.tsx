"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSpeakerMap } from "../../protocol-actions";
import type { MeetingDetail } from "../../queries";
import { formatClock, selectClassName, useMeetingAction } from "../meeting-ui";

type SpeakerMap = Record<string, { userId: string | null; label: string }>;

/** Human name of a speaker key, falling back to "Sprecher 1" style names. */
export function speakerName(key: string, map: SpeakerMap, order: string[], fallback: (index: number) => string) {
  return map[key]?.label || fallback(order.indexOf(key) + 1);
}

export function speakerOrder(segments: Array<{ speakerKey: string }>) {
  return [...new Set(segments.map((segment) => segment.speakerKey))];
}

export function TranscriptPanel({ detail }: { detail: MeetingDetail }) {
  const t = useTranslations("meetings");
  const transcript = detail.transcript;
  const { pending, run } = useMeetingAction();
  const order = useMemo(() => speakerOrder(transcript?.segments ?? []), [transcript]);
  const [draft, setDraft] = useState<SpeakerMap>(() => transcript?.speakerMap ?? {});
  const [editing, setEditing] = useState(false);
  if (!transcript) {
    return <p className="text-sm text-muted-foreground">{detail.meeting.aiPolicy === "none" ? t("transcript.aiOff") : t("transcript.empty")}</p>;
  }
  const canContribute = detail.role !== "viewer";
  const fallback = (index: number) => t("transcript.speaker", { number: index });

  function save() {
    run(() => saveSpeakerMap({ sessionTranscriptId: transcript!.id, baseRevision: transcript!.speakerMapRevision, map: draft }), () => setEditing(false));
  }

  return (
    <div className="space-y-4">
      {transcript.missingInputs.length > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm" role="status">{t("transcript.missing", { count: transcript.missingInputs.length })}</p>
      )}
      <section className="space-y-2 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium">{t("transcript.speakers")}</h3>
          {canContribute && !editing && <Button size="sm" variant="outline" onClick={() => { setDraft(transcript.speakerMap); setEditing(true); }}>{t("transcript.nameSpeakers")}</Button>}
        </div>
        <p className="text-xs text-muted-foreground">{t("transcript.speakersHint")}</p>
        <ul className="space-y-2">
          {order.map((key) => (
            <li key={key} className="grid items-center gap-2 text-sm sm:grid-cols-[10rem_1fr_1fr]">
              <span className="font-medium">{fallback(order.indexOf(key) + 1)}</span>
              {editing ? (
                <>
                  <select
                    className={selectClassName}
                    aria-label={t("transcript.person")}
                    value={draft[key]?.userId ?? ""}
                    onChange={(event) => {
                      const member = detail.members.find((candidate) => candidate.userId === event.target.value);
                      setDraft((current) => ({ ...current, [key]: { userId: member?.userId ?? null, label: member?.name ?? current[key]?.label ?? "" } }));
                    }}
                  >
                    <option value="">{t("transcript.notAMember")}</option>
                    {detail.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
                  </select>
                  <Input
                    aria-label={t("transcript.label")}
                    value={draft[key]?.label ?? ""}
                    maxLength={120}
                    placeholder={t("transcript.labelPlaceholder")}
                    onChange={(event) => setDraft((current) => ({ ...current, [key]: { userId: current[key]?.userId ?? null, label: event.target.value } }))}
                  />
                </>
              ) : <span className="sm:col-span-2">{transcript.speakerMap[key]?.label || "–"}</span>}
            </li>
          ))}
        </ul>
        {editing && (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
            <Button size="sm" disabled={pending} onClick={save}>{t("transcript.saveSpeakers")}</Button>
          </div>
        )}
        {!editing && detail.meeting.aiPolicy === "openai" && <p className="text-xs text-muted-foreground">{t("transcript.regenerateHint")}</p>}
      </section>
      <ol className="space-y-2">
        {transcript.segments.map((segment) => (
          <li key={segment.id} id={`segment-${segment.id}`} className="grid gap-1 text-sm sm:grid-cols-[4.5rem_9rem_1fr]">
            <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatClock(segment.startMs)}</span>
            <span className="truncate font-medium">{speakerName(segment.speakerKey, transcript.speakerMap, order, fallback)}</span>
            <span>{segment.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
