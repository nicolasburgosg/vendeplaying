import type { ReactNode } from "react";

export function AppPageIntro({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <section className="pb-8 md:pb-10">
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
        <div>
          <p className="site-kicker">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="space-y-4">
          <p className="site-lead max-w-none">{description}</p>
          {aside}
        </div>
      </div>
    </section>
  );
}
