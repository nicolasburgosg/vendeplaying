import type { ReactNode } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/app/actions";
import { AppSidebarNav } from "@/components/app-sidebar-nav";
import { BrandLockup } from "@/components/brand-lockup";
import { StatusPill } from "@/components/status-pill";

export function AppShell({
  organizationName,
  organizationSlug,
  userName,
  userEmail,
  channelStatusLabel,
  inboxCount,
  pedidosCount,
  children,
}: {
  organizationName: string;
  organizationSlug: string;
  userName: string;
  userEmail: string;
  membershipRole: string;
  channelStatusLabel: string;
  inboxCount?: number;
  pedidosCount?: number;
  children: ReactNode;
}) {
  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_1fr]">
      <aside
        aria-label="Navegación principal"
        className="flex flex-col border-b border-line bg-surface px-5 py-6 lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-b-0 lg:border-line"
      >
        <BrandLockup subtitle="Operación comercial" />

        <div className="mt-6 space-y-2">
          <p className="text-sm font-semibold">{organizationName}</p>
          <p className="text-xs text-muted">{organizationSlug}</p>
          <StatusPill tone="accent">{channelStatusLabel}</StatusPill>
        </div>

        <AppSidebarNav inboxCount={inboxCount} pedidosCount={pedidosCount} />

        <div className="mt-auto space-y-1 border-t border-line pt-5 text-sm">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{userName}</p>
              <p className="truncate text-xs text-muted">{userEmail}</p>
            </div>
          </div>
          <form action={signOutAction} className="pt-1">
            <button
              type="submit"
              className="text-xs text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cerrar sesión
            </button>
          </form>
        </div>

        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <p className="text-xs text-muted">Recursos</p>
          <a
            href="mailto:soporte@vendeto.com"
            className="block text-xs text-muted transition-colors hover:text-foreground"
          >
            Contactar soporte
          </a>
          <Link
            href="/contacto"
            className="block text-xs text-muted transition-colors hover:text-foreground"
          >
            Centro de ayuda
          </Link>
        </div>
      </aside>

      <main className="min-w-0 px-8 py-8 lg:px-10 lg:py-10">{children}</main>
    </div>
  );
}
