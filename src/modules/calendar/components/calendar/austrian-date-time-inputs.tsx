"use client";

// Date (dd.mm.yyyy) and time (HH:mm) inputs with Austrian formatting and a native date picker.
// Used by event-dialog.tsx.
import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  formatAustrianDate,
  parseAustrianDate,
  parseAustrianTime,
} from "../../localized-date-time";

export function AustrianDateInput({
  value,
  onChange,
  label,
  pickerLabel,
  placeholder,
  invalidMessage,
  min,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  pickerLabel: string;
  placeholder: string;
  invalidMessage: string;
  min?: string;
}) {
  const [display, setDisplay] = useState(() => formatAustrianDate(value));
  const displayRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  function update(raw: string, input: HTMLInputElement) {
    setDisplay(raw);
    const parsed = parseAustrianDate(raw);
    const valid = Boolean(parsed && (!min || parsed >= min));
    input.setCustomValidity(valid ? "" : invalidMessage);
    if (valid && parsed) onChange(parsed);
  }

  return (
    <div className="relative min-w-0">
      <Input
        ref={displayRef}
        required
        aria-label={label}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        pattern="[0-9]{2}\.[0-9]{2}\.[0-9]{4}"
        value={display}
        onChange={(event) => update(event.target.value, event.currentTarget)}
        onBlur={(event) => update(event.currentTarget.value, event.currentTarget)}
        className="min-w-[9.5rem] pr-9 font-mono tabular-nums"
      />
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        onChange={(event) => {
          if (!event.target.value) return;
          setDisplay(formatAustrianDate(event.target.value));
          displayRef.current?.setCustomValidity("");
          onChange(event.target.value);
        }}
        className="pointer-events-none absolute right-2 top-1/2 size-px -translate-y-1/2 opacity-0"
      />
      <button
        type="button"
        aria-label={pickerLabel}
        onClick={() => {
          try {
            pickerRef.current?.showPicker();
          } catch {
            pickerRef.current?.click();
          }
        }}
        className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CalendarDays className="size-4" />
      </button>
    </div>
  );
}

export function AustrianTimeInput({
  value,
  onChange,
  label,
  invalidMessage,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalidMessage: string;
}) {
  const [display, setDisplay] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  function update(raw: string, input: HTMLInputElement, normalize = false) {
    const parsed = parseAustrianTime(raw);
    setDisplay(normalize && parsed ? parsed : raw);
    input.setCustomValidity(parsed ? "" : invalidMessage);
    if (parsed) onChange(parsed);
  }

  return (
    <Input
      ref={inputRef}
      required
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      placeholder="HH:mm"
      pattern="[0-9]{1,2}:[0-9]{2}"
      value={display}
      onChange={(event) => update(event.target.value, event.currentTarget)}
      onBlur={(event) =>
        update(event.currentTarget.value, event.currentTarget, true)
      }
      className="w-full min-w-[6.5rem] font-mono tabular-nums"
    />
  );
}
