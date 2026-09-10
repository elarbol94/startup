"use client";

import { useState } from "react";
import { UserIdentity } from "./user-identity";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type PersonOption = { value: string; name: string; userId: string | null };

/** Values may be employee IDs; only the explicit linked user ID controls identity. */
export function PersonSelect({ options, value, onValueChange, name, id, label, emptyLabel, disabled }: {
  options: PersonOption[]; value?: string; onValueChange?: (value: string) => void;
  name?: string; id?: string; label: string; emptyLabel?: string; disabled?: boolean;
}) {
  const [selection, setSelection] = useState(emptyLabel ? "" : options[0]?.value ?? "");
  const availableSelection = options.some(option => option.value === selection)
    ? selection
    : emptyLabel ? "" : options[0]?.value ?? "";
  const selectedValue = value ?? availableSelection;
  const selected = options.find(option => option.value === selectedValue);
  return <Select name={name} value={selectedValue} disabled={disabled} onValueChange={next => {
    setSelection(next ?? ""); onValueChange?.(next ?? "");
  }}>
    <SelectTrigger id={id} className="w-full" aria-label={label}><SelectValue>{selected ? <UserIdentity userId={selected.userId} name={selected.name} /> : emptyLabel}</SelectValue></SelectTrigger>
    <SelectContent>
      {emptyLabel && <SelectItem value="">{emptyLabel}</SelectItem>}
      {options.map(option => <SelectItem key={option.value} value={option.value}><UserIdentity userId={option.userId} name={option.name} /></SelectItem>)}
    </SelectContent>
  </Select>;
}
