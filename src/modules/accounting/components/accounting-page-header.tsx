import type { ComponentProps } from "react";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { AccountingEyebrow, AccountingNav } from "./accounting-nav";

/** Page header of an accounting page with the accounting tabs under it (design 1b). */
export function AccountingPageHeader({ className, ...props }: ComponentProps<typeof PageHeader>) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <PageHeader eyebrow={<AccountingEyebrow />} {...props} className="mb-0" />
      <AccountingNav />
    </div>
  );
}
