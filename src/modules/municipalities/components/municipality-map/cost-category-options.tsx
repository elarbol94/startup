// The Kostenübersicht's category dropdown: Aufgabengruppen, then income types, then balances.
// Used by the desktop and mobile metric controls.
import { isIncomeBalanceTarget, isIncomeTargetId, type CostViewTarget } from "../../income";
import type { Labels } from "./map-types";

export function CostCategoryOptions({ labels }: { labels: Pick<Labels, "costCategories" | "costGroups"> }) {
  const entries = Object.entries(labels.costCategories) as Array<[CostViewTarget, string]>;
  const groups = [
    { id: "expenses", items: entries.filter(([id]) => !isIncomeTargetId(id)) },
    { id: "income", items: entries.filter(([id]) => isIncomeTargetId(id) && !isIncomeBalanceTarget(id)) },
    { id: "balances", items: entries.filter(([id]) => isIncomeBalanceTarget(id)) },
  ] as const;
  return groups.map(({ id, items }) => items.length ? (
    <optgroup key={id} label={labels.costGroups[id]}>
      {/* Aufgabengruppen keep their VRV number, which readers of Rechnungsabschlüsse know them by. */}
      {items.map(([value, label]) => <option key={value} value={value}>{id === "expenses" ? `${value} · ${label}` : label}</option>)}
    </optgroup>
  ) : null);
}
