import Link from "next/link";

/** Opens the municipality on the map section's overview. */
export function municipalityHref(code: string) {
  return `/municipalities/overview?municipality=${encodeURIComponent(code)}`;
}

export function MunicipalityLink({ code, name, className }: { code: string; name: string; className?: string }) {
  return (
    <Link href={municipalityHref(code)} className={className ?? "underline-offset-4 hover:underline"}>
      {name}
    </Link>
  );
}
