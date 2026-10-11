import { Skeleton } from "@/components/ui/skeleton";

export default function MeetingsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-full max-w-sm rounded-lg" />
        <Skeleton className="ml-auto h-8 w-40 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="border-b border-line-soft px-[18px] py-3"><Skeleton className="h-7 w-72 rounded-lg" /></div>
        <div className="divide-y divide-line-soft">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-3 px-[18px] py-[11px]">
              <Skeleton className="size-4 rounded" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
