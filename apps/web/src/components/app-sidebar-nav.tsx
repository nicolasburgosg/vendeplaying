"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  MessageSquare,
  ShoppingBag,
  Bot,
  Users,
  ClipboardList,
  CreditCard,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: "inbox" | "pedidos";
};

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: "Plataforma",
    items: [
      { href: "/app", label: "Inicio", icon: Home },
      { href: "/app/inbox", label: "Mensajes", icon: MessageSquare, badgeKey: "inbox" },
      { href: "/app/catalogo", label: "Catálogo", icon: ShoppingBag },
      { href: "/app/ia-vendedora", label: "Agente IA", icon: Bot },
      { href: "/app/clientes", label: "Clientes", icon: Users },
      { href: "/app/pedidos", label: "Pedidos", icon: ClipboardList, badgeKey: "pedidos" },
    ],
  },
  {
    label: "Operaciones",
    items: [
      { href: "/app/pagos", label: "Pagos", icon: CreditCard },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { href: "/app/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/app") {
    return pathname === "/app";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebarNav({
  inboxCount,
  pedidosCount,
}: {
  inboxCount?: number;
  pedidosCount?: number;
}) {
  const pathname = usePathname();

  const badges: Record<string, number | undefined> = {
    inbox: inboxCount,
    pedidos: pedidosCount,
  };

  return (
    <nav className="mt-6 flex-1 space-y-5">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="mb-1 px-3 text-xs text-muted">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-accent-soft text-foreground"
                      : "sidebar-link-inactive"
                  }`}
                >
                  <Icon aria-hidden="true" size={16} strokeWidth={active ? 2.25 : 1.75} />
                  <span className="flex-1">{item.label}</span>
                  {badge != null && badge > 0 && (
                    <span
                      aria-label={`${badge} pendiente${badge !== 1 ? "s" : ""}`}
                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[0.65rem] font-semibold tabular-nums text-white"
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
