"use client";
// Input and textarea that hold a draft until the field is left, for the presentation
// editor's panels. Used by presentation-editor.tsx and its inspector/path/dialog pieces.
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDraft } from "./use-draft";

type DraftFieldProps = {
  value: string;
  onCommit: (next: string) => void;
};

export function DraftInput({
  value,
  onCommit,
  normalise,
  ...props
}: DraftFieldProps & { normalise?: (raw: string) => string } & Omit<
    React.ComponentProps<typeof Input>,
    "value" | "onChange" | "onBlur" | "onKeyDown"
  >) {
  const field = useDraft(value, onCommit, normalise);
  return (
    <Input
      {...props}
      value={field.draft}
      // Read by the editor's beforeunload guard: typed text that has not been committed yet.
      data-draft-pending={field.draft !== value || undefined}
      onChange={(event) => field.setDraft(event.currentTarget.value)}
      onBlur={field.commit}
      // Enter commits only here: in a textarea it is part of the text.
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        field.commit();
      }}
    />
  );
}

export function DraftTextarea({
  value,
  onCommit,
  ...props
}: DraftFieldProps & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur">) {
  const field = useDraft(value, onCommit);
  return (
    <Textarea
      {...props}
      value={field.draft}
      // Read by the editor's beforeunload guard: typed text that has not been committed yet.
      data-draft-pending={field.draft !== value || undefined}
      onChange={(event) => field.setDraft(event.currentTarget.value)}
      onBlur={field.commit}
    />
  );
}
