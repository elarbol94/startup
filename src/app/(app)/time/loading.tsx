import { Skeleton } from "@/components/ui/skeleton";

export default function TimeLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-36 rounded-2xl" />
      </div>
      <Skeleton className="h-[28rem] w-full rounded-2xl" />
    </div>
  );
}
