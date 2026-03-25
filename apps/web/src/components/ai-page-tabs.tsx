"use client";

import { type ReactNode, useState } from "react";

const TABS = [
  { key: "personalidad", label: "Personalidad" },
  { key: "probar", label: "Probar agente" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AiPageTabs({
  personalidad,
  probar,
}: {
  personalidad: ReactNode;
  probar: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("personalidad");

  const panels: Record<TabKey, ReactNode> = {
    personalidad,
    probar,
  };

  return (
    <>
      <nav className="flex gap-0 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`px-5 py-3 text-sm font-medium transition-colors ${
              active === tab.key
                ? "border-b-2 border-foreground text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {panels[active]}
    </>
  );
}
