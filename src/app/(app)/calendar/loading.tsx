import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[112rem] flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-[34px] w-28 rounded-[10px]" />
          <Skeleton className="hidden h-[34px] w-80 rounded-[10px] sm:block" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
      <div className="flex min-h-[44rem] gap-4">
        <Skeleton className="hidden w-60 shrink-0 rounded-xl xl:block" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    </div>
  );
}
