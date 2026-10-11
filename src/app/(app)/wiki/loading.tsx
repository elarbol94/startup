import { Skeleton } from "@/components/ui/skeleton";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

/** Wiki route skeleton (design 1b): page header, then one list card. */
export default function Loading() {
  return (
    <div className={WIKI_PAGE_CLASS} aria-busy="true" aria-label="Loading">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-7 w-56 max-w-2/3" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="flex h-[52px] items-center border-b border-line-soft px-[18px]">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="divide-y divide-line-soft">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-[18px] py-[11px]">
              <Skeleton className="size-4 shrink-0 rounded" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
