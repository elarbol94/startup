import { AppWorkspace } from "@/components/workspace/app-workspace";
import { WikiNavigation } from "@/modules/wiki/components/wiki-navigation";
import { BugReportProvider } from "@/modules/projects/bugs/report-provider";
import { UserIdentityProvider } from "@/components/user-identity";
import type { Metadata } from "next";
import { getAppSettings, listUserIdentities } from "@/modules/settings/queries";
import { ensureUserMarkColor } from "@/lib/user-mark-colors.server";
import { Suspense } from "react";
import { connection } from "next/server";
import { requireUser } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskCreateProvider } from "@/modules/tasks/components/task-create-provider";
import { DeadlineCreateProvider } from "@/modules/tasks/components/deadline-create-provider";
import { ContactCaptureProvider } from "@/modules/network/components/contact-capture-provider";
import { FocusModeProvider } from "@/components/focus-mode";
import { FocusBootstrapScript } from "@/components/focus/focus-bootstrap-script";

// This authenticated dashboard reads mutable, user-specific better-sqlite3
// data throughout its route tree. It cannot safely serve a prefetched static
// shell captured from a runtime sample.
export const instant = false;

const FALLBACK_PRODUCT_NAME = "Management-Plattform";

function companyDisplayName() {
  return getAppSettings().companyName.trim();
}

export async function generateMetadata(): Promise<Metadata> {
  // Company settings live in mutable SQLite rows; read them per request.
  await connection();
  const name = companyDisplayName() || FALLBACK_PRODUCT_NAME;
  return { title: { default: name, template: `%s · ${name}` } };
}

async function AuthenticatedSidebar() {
  const user = await requireUser();
  return <AppSidebar userName={user.name} userEmail={user.email} companyName={companyDisplayName()} />;
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
    <FocusBootstrapScript userId={currentUser.id} />
    <FocusModeProvider userId={currentUser.id}>
    <WikiNavigation userId={currentUser.id}>
    <TaskCreateProvider>
      <DeadlineCreateProvider>
      <ContactCaptureProvider userId={currentUser.id}>
      <BugReportProvider>
      <style>{`
        /* Focus mode (see src/lib/focus-mode.ts). The attributes on <html> are set before
           the first paint, so these rules hide the chrome without a flash. */
        html[data-focus-global="true"] [data-app-shell] > [data-app-chrome],
        html[data-focus-reader="true"] [data-app-shell] > [data-app-chrome],
        html[data-focus-global="true"] [data-focus-chrome],
        html[data-focus-reader="true"] [data-focus-chrome] {
          display: none;
        }
        html[data-focus-global="true"],
        html[data-focus-reader="true"] {
          --app-rail-width: 0px !important;
          --research-rail-width: 0px !important;
        }
        html[data-focus-reader="true"] [data-app-shell]:not([data-workspace-embedded]) [data-workspace-content],
        html[data-focus-global="true"] [data-app-shell][data-focus-tabs-revealed] [data-workspace-content] {
          height: calc(100dvh - 2.75rem);
        }
        html[data-focus-global="true"] [data-app-shell]:not([data-focus-tabs-revealed]) [data-workspace-toolbar] {
          display: none;
        }
        html[data-focus-global="true"] [data-app-shell]:not([data-focus-tabs-revealed]):not([data-workspace-embedded]) [data-workspace-content] {
          height: 100dvh;
        }
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
      </BugReportProvider>
      </ContactCaptureProvider>
      </DeadlineCreateProvider>
    </TaskCreateProvider>
    </WikiNavigation>
    </FocusModeProvider>
    </UserIdentityProvider>
  );
}
