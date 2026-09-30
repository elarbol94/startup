import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "@/components/server-safe-icons";
import { requireUser } from "@/lib/auth";
import { listCustomers } from "@/modules/accounting/invoice-queries";
import { CustomersClient } from "@/modules/accounting/components/customers-client";
import { linkedProjectsFor } from "@/modules/context/project-link-refs";
import { Button } from "@/components/ui/button";

export default async function CustomersPage() {
  await requireUser();
  const tDocuments = await getTranslations("documents");
  const rows = listCustomers();
  const projectsByCustomer = linkedProjectsFor("customer", rows.map((customer) => customer.id));
  const customers = rows.map((customer) => ({ ...customer, projects: projectsByCustomer.get(customer.id) ?? [] }));

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
        nativeButton={false}
        render={<Link href="/accounting/invoices" />}
      >
        <ArrowLeft className="size-4" />
        {tDocuments("title")}
      </Button>
      <CustomersClient customers={customers} />
    </div>
  );
}
