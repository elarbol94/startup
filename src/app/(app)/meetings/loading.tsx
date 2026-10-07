import { Skeleton } from "@/components/ui/skeleton";

export default function MeetingsLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-[24rem] w-full rounded-2xl" />
    </div>
  );
}
