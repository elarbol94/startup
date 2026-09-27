"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setNetworkContactTags } from "../contact-actions";
import { parseTagInput } from "../network-utils";
import type { NetworkTag } from "../queries";
import { TagSuggestions } from "./tag-suggestions";
import { useNetworkAction } from "./use-network-action";

export function ContactTagsEditor({
  contactId,
  tags,
  suggestions,
  canEdit,
}: {
  contactId: string;
  tags: NetworkTag[];
  suggestions: string[];
  canEdit: boolean;
}) {
  const t = useTranslations("network");
  const { pending, run } = useNetworkAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  function start() {
    setValue(tags.map((tag) => tag.name).join(", "));
    setEditing(true);
  }

  function save() {
    run(() => setNetworkContactTags({ contactId, tags: parseTagInput(value) }), () => {
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
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          autoFocus
          aria-label={t("fields.tags")}
          value={value}
          placeholder={t("tags.placeholder")}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
            if (event.key === "Escape") setEditing(false);
          }}
        />
        <Button size="sm" disabled={pending} onClick={save}>{t("save")}</Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{t("cancel")}</Button>
      </div>
      <TagSuggestions value={value} suggestions={suggestions} onChange={setValue} />
    </div>
  );
}
