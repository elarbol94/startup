import { Skeleton } from "@/components/ui/skeleton";

export default function NetworkLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-full rounded-lg" />
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-8 w-32 rounded-lg" />)}
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="divide-y divide-line-soft">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-[18px] py-[11px]">
              <Skeleton className="size-[26px] rounded-full" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-3 w-1/3" /></div>
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
