import { Skeleton } from "@/components/ui/skeleton";

export default function NetworkLoading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-[28rem] w-full rounded-2xl" />
    </div>
  );
}
