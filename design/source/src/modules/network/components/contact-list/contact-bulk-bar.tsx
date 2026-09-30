"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SelectionBar } from "@/components/selection-bar";
import { TagEditDialog, type TagEditOption } from "@/components/tag-edit-dialog";
import { useRowSelectionContext } from "@/components/row-selection";
import { useBulkAction } from "@/lib/use-bulk-action";
import { bulkDeleteContacts, bulkSetContactVisibility, bulkUpdateContactTags } from "../../bulk-actions";
import { contactVisibilities } from "../../constants";

export type BulkContact = { id: string; name: string; canManage: boolean; tags: string[] };

/** Bulk tag, visibility and delete actions for the contacts selected in "My network". */
export function ContactBulkBar({ contacts }: { contacts: BulkContact[] }) {
  const t = useTranslations("network");
  const tCommon = useTranslations("common");
  const selection = useRowSelectionContext();
  const { run, pending } = useBulkAction(selection.deselect);
  const [confirmDialog, confirm] = useConfirm();
  const [tagsOpen, setTagsOpen] = useState(false);
  const ids = selection.selectedIds;
  const selected = useMemo(() => {
    const chosen = new Set(ids);
    return contacts.filter((contact) => chosen.has(contact.id));
  }, [contacts, ids]);
  const manageable = selected.filter((contact) => contact.canManage).map((contact) => contact.id);
  const tagOptions = useMemo((): TagEditOption[] => {
    const byKey = new Map<string, TagEditOption>();
    for (const contact of contacts) for (const name of contact.tags) {
      const key = name.toLocaleLowerCase();
      const option = byKey.get(key) ?? { key: name, name, count: 0 };
      if (selected.includes(contact)) option.count += 1;
      byKey.set(key, option);
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [contacts, selected]);

  async function remove() {
    const skipped = ids.length - manageable.length;
    const ok = await confirm({
      title: t("bulk.deleteTitle", { count: manageable.length }),
      description: [t("bulk.deleteConfirm"), skipped > 0 ? t("bulk.notManageable", { count: skipped }) : ""].filter(Boolean).join(" "),
      confirmLabel: tCommon("delete"),
      destructive: true,
    });
    if (ok) await run(() => bulkDeleteContacts({ ids }), { done: (outcome) => t("bulk.deleted", { count: outcome.succeededIds.length }) });
  }

  return <>
    <SelectionBar count={selection.count} onClear={selection.clear}>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setTagsOpen(true)}><Tags className="size-4" />{t("fields.tags")}</Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={pending || manageable.length === 0} />}>{t("bulk.visibility")}<ChevronDown className="size-3.5" /></DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          {contactVisibilities.map((visibility) => (
            <DropdownMenuItem key={visibility} onClick={() => void run(() => bulkSetContactVisibility({ ids, visibility }))}>{t(`visibility.${visibility}`)}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending || manageable.length === 0} title={manageable.length === 0 ? t("bulk.notManageable", { count: ids.length }) : undefined} onClick={() => void remove()}><Trash2 className="size-4" />{tCommon("delete")}</Button>
    </SelectionBar>
    <TagEditDialog
      open={tagsOpen}
      onOpenChange={setTagsOpen}
      options={tagOptions}
      selectedCount={selected.length}
      onSubmit={async (change) => { await run(() => bulkUpdateContactTags({ ids, ...change })); }}
    />
    {confirmDialog}
  </>;
}
