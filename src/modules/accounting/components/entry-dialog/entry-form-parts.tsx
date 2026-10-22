// Field label with tax help tooltip and the titled card section that every part of the
// entry form sits in. Used by entry-dialog.tsx and components/entry-dialog/.
"use client";

import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TaxHelp({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={text}
          />
        }
      >
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-80 leading-5">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function FieldLabel({ htmlFor, children, help }: { htmlFor?: string; children: React.ReactNode; help?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor}>{children}</Label>
      {help && <TaxHelp text={help} />}
    </span>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b border-line-soft px-4 py-3">
        <h3 className="text-[14.5px] font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
