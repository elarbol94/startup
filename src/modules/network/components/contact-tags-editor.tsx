"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setNetworkContactTags } from "../contact-actions";
import type { Suggestion } from "../network-utils";
import type { NetworkTag } from "../queries";
import { PopularTags, TagInput } from "./tag-input";
import { useNetworkAction } from "./use-network-action";

export function ContactTagsEditor({
  contactId,
  tags,
  suggestions,
  canEdit,
}: {
  contactId: string;
  tags: NetworkTag[];
  suggestions: Suggestion[];
  canEdit: boolean;
}) {
  const t = useTranslations("network");
  const { pending, run } = useNetworkAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string[]>([]);

  function start() {
    setValue(tags.map((tag) => tag.name));
    setEditing(true);
  }

  function save(next = value) {
    run(() => setNetworkContactTags({ contactId, tags: next }), () => {
      toast.success(t("tags.saved"));
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.length ? tags.map((tag) => <Badge key={tag.id} variant="secondary">{tag.name}</Badge>) : (
          <span className="text-sm text-muted-foreground">{t("tags.none")}</span>
        )}
        {canEdit && (
          <Button size="icon-xs" variant="ghost" aria-label={t("tags.edit")} onClick={start}>
            <Pencil />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") setEditing(false);
      }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <TagInput autoFocus value={value} suggestions={suggestions} onChange={setValue} onSubmit={() => save()} />
        </div>
        <Button size="sm" disabled={pending} onClick={() => save()}>{t("save")}</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{t("cancel")}</Button>
      </div>
      <PopularTags value={value} suggestions={suggestions} onChange={setValue} />
    </div>
  );
}
