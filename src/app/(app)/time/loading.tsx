import { Skeleton } from "@/components/ui/skeleton";

export default function TimeLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-[22rem] w-full rounded-xl" />
        </div>
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    </div>
  );
}
