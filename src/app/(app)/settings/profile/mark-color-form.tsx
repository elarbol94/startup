"use client";

import { IDENTITY_CHANGED, useIdentityColor } from "@/components/user-identity";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateMyMarkColor } from "@/modules/settings/actions";
import {
  USER_MARK_COLORS,
  getUserMarkColor,
  initialsForName,
  userMarkColorStyle,
  type UserMarkColor,
} from "@/lib/user-mark-colors";
import { cn } from "@/lib/utils";
import { SettingsCard } from "../settings-card";

type Availability = {
  key: UserMarkColor;
  available: boolean;
  mine: boolean;
  ownerName: string | null;
};

export function MarkColorForm({
  userId,
  name,
  currentColor,
  availability,
}: {
  userId: string;
  name: string;
  currentColor: string;
  availability: Availability[];
}) {
  const t = useTranslations("settings.profile");
  const router = useRouter();
  const common = useTranslations("common");
  const selected = getUserMarkColor(useIdentityColor(userId, currentColor)).key;
  const [pending, startTransition] = useTransition();
  const availabilityByKey = new Map(availability.map((item) => [item.key, item]));

  function choose(color: UserMarkColor) {
    const item = availabilityByKey.get(color);
    if (!item?.available || pending || color === selected) return;
    startTransition(async () => {
      try {
        const result = await updateMyMarkColor(color);
        if (!result.ok) {
          toast.error(t("conflict"));
          router.refresh();
          return;
        }
        window.dispatchEvent(new CustomEvent(IDENTITY_CHANGED, { detail: { id: userId, markColor: color } }));
        toast.success(t("saved"));
        router.refresh();
      } catch {
        toast.error(common("error"));
      }
    });
  }

  return <SettingsCard title={t("title")} description={t("description")} contentClassName="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3">
      <span
        className="grid size-11 shrink-0 place-items-center rounded-full text-base font-semibold"
        style={{ ...userMarkColorStyle(selected), backgroundColor: "var(--user-mark-solid)", color: "white" }}
      >
        {initialsForName(name)}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{t("previewLabel")}</p>
      </div>
      <mark
        className="ml-auto rounded px-2 py-1 text-[13.5px] text-foreground"
        style={{ ...userMarkColorStyle(selected), backgroundColor: "var(--user-mark-highlight)", boxShadow: "inset 0 -2px var(--user-mark-solid)" }}
      >
        {t("sampleText")}
      </mark>
    </div>
    <fieldset disabled={pending} className="border-t border-line-soft pt-4">
      <legend className="float-left mb-2.5 w-full text-[13px] font-medium">{t("chooseColor")}</legend>
      <div className="clear-left flex flex-wrap gap-1.5">
        {USER_MARK_COLORS.map((color) => {
          const item = availabilityByKey.get(color.key);
          const disabled = !item?.available;
          const active = selected === color.key;
          return <button
            key={color.key}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            aria-label={disabled ? t("unavailableColor", { color: t(`colors.${color.key}`) }) : t(`colors.${color.key}`)}
            title={disabled ? t("unavailableColor", { color: t(`colors.${color.key}`) }) : t(`colors.${color.key}`)}
            onClick={() => choose(color.key)}
            className={cn(
              "relative grid size-7 place-items-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              active && "shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--brand)]",
              disabled && "cursor-not-allowed opacity-40",
            )}
            style={{ ...userMarkColorStyle(color.key), backgroundColor: "var(--user-mark-solid)" }}
          >
            {active && <Check className="size-3.5 text-white" />}
            {disabled && <LockKeyhole className="size-3 text-white" />}
          </button>;
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("availabilityHint")}</p>
    </fieldset>
  </SettingsCard>;
}
