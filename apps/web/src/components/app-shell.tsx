import type { ReactNode } from "react";
import { signOutAction } from "@/app/app/actions";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { BrandLockup } from "@/components/brand-lockup";
import { StatusPill } from "@/components/status-pill";
import { labelMembershipRole } from "@/lib/labels";

export function AppShell({
  organizationName,
  organizationSlug,
  userName,
  userEmail,
  membershipRole,
  channelStatusLabel,
  children,
}: {
  organizationName: string;
  organizationSlug: string;
  userName: string;
  userEmail: string;
  membershipRole: string;
  channelStatusLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid w-full gap-10 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
        <aside className="border-b border-line pb-8 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0 lg:pr-8">
          <BrandLockup subtitle="Operacion comercial" />

          <div className="mt-8 space-y-3 border-t border-line pt-6">
            <p className="text-sm font-semibold">{organizationName}</p>
            <p className="text-sm text-muted">{organizationSlug}</p>
            <StatusPill tone="accent">{channelStatusLabel}</StatusPill>
          </div>

          <AppSidebarNav />

          <div className="mt-8 space-y-3 border-t border-line pt-6 text-sm">
            <div>
              <p className="font-semibold">{userName}</p>
              <p className="mt-1 text-muted">{userEmail}</p>
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-accent-strong">
              {labelMembershipRole(membershipRole)}
            </p>
            <form action={signOutAction}>
              <button
                type="submit"
                className="site-button-secondary w-full justify-center"
              >
                Cerrar sesion
              </button>
            </form>
          </div>
        </aside>

        <main className="min-w-0 space-y-10 pb-12">{children}</main>
      </div>
    </div>
  );
}
