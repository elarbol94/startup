import { Skeleton } from "@/components/ui/skeleton";

export default function PersonnelLoading() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-[5.5rem] w-full rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[22rem] rounded-xl" />
        <Skeleton className="h-[16rem] rounded-xl" />
      </div>
    </div>
  );
}
