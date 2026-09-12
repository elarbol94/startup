import { AppWorkspace } from "@/components/workspace/app-workspace";
import { WikiNavigation } from "@/modules/wiki/components/wiki-navigation";
import { UserIdentityProvider } from "@/components/user-identity";
import { listUserIdentities } from "@/modules/settings/queries";
import { ensureUserMarkColor } from "@/lib/user-mark-colors.server";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskCreateProvider } from "@/modules/tasks/components/task-create-provider";
import { DeadlineCreateProvider } from "@/modules/tasks/components/deadline-create-provider";

// This authenticated dashboard reads mutable, user-specific better-sqlite3
// data throughout its route tree. It cannot safely serve a prefetched static
// shell captured from a runtime sample.
export const unstable_instant = false;

async function AuthenticatedSidebar() {
  const user = await requireUser();
  return <AppSidebar userName={user.name} userEmail={user.email} />;
}

function SidebarFallback() {
  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur md:hidden">
        <Skeleton className="size-8" />
        <Skeleton className="h-4 w-36" />
      </header>
      <aside className="hidden w-14 shrink-0 border-r md:block">
        <div className="space-y-3 p-2 pt-16">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="size-10 rounded-md" />
          ))}
        </div>
      </aside>
    </>
  );
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // All application data comes from synchronous better-sqlite3 queries.
  // With Cache Components enabled, Next can otherwise place those reads in a
  // prerendered shell and serve stale rows after a mutation.
  await connection();
  const currentUser = await requireUser();
  ensureUserMarkColor(currentUser.id);
  return (
    <UserIdentityProvider currentUserId={currentUser.id} identities={listUserIdentities()}>
    <WikiNavigation userId={currentUser.id}>
    <TaskCreateProvider>
      <DeadlineCreateProvider>
      <style>{`
        [data-app-shell]:has([data-project-focus-root="true"]) > [data-app-chrome] {
          display: none;
        }
        [data-app-shell]:has([data-project-focus-root="true"]) > [data-app-main] {
          overflow: hidden;
          padding: 0;
        }
        [data-app-shell]:has([data-project-focus-root="true"]) [data-workspace-toolbar] { display: none; }
        [data-app-shell]:has([data-project-focus-root="true"]) [data-workspace-content] { height: 100dvh; }
        #workspace-panel-primary:has([data-project-focus-root="true"]) { padding: 0; }
      `}</style>
      <AppWorkspace userId={currentUser.id} navigation={
        <Suspense fallback={<SidebarFallback />}>
          <AuthenticatedSidebar />
        </Suspense>
      }>{children}</AppWorkspace>
      </DeadlineCreateProvider>
    </TaskCreateProvider>
    </WikiNavigation>
    </UserIdentityProvider>
  );
}
