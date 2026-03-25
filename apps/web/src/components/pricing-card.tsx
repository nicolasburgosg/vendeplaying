import Link from "next/link";
import { IllustrationSlot } from "@/components/illustration-slot";

export interface PricingPlan {
  name: string;
  tag?: string;
  price: string;
  description: string;
  features: string[];
  cta: { label: string; href: string };
  variant: "light" | "dark";
  illustration: string;
}

export function PricingCard({ plan }: { plan: PricingPlan }) {
  const isDark = plan.variant === "dark";

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl ${
        isDark ? "card-dark" : "surface-card"
      }`}
    >
      {/* Illustration header */}
      <div className={`px-6 pt-6 ${isDark ? "opacity-70" : ""}`}>
        <IllustrationSlot
          width={400}
          height={160}
          label={plan.illustration}
          className={`w-full ${isDark ? "border-white/15" : ""}`}
        />
      </div>

      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Name + tag */}
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold">{plan.name}</h3>
          {plan.tag ? (
            <span className="rounded-md bg-green-primary px-2.5 py-1 text-xs font-semibold text-white">
              {plan.tag}
            </span>
          ) : null}
        </div>

        {/* Price */}
        <p className={`text-sm font-medium ${isDark ? "text-white/60" : "text-muted"}`}>
          {plan.price}
        </p>

        {/* Description */}
        <p className={`text-sm leading-relaxed ${isDark ? "text-white/70" : "text-muted"}`}>
          {plan.description}
        </p>

        {/* Feature list */}
        <ul className="flex-1 space-y-3">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm">
              <svg
                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isDark ? "text-green-light" : "text-green-primary"}`}
                fill="none"
                viewBox="0 0 16 16"
              >
                <path
                  d="M3.5 8.5l3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={isDark ? "text-white/80" : "text-foreground"}>
                {f}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Link
          href={plan.cta.href}
          className={isDark ? "site-button-white w-full text-center" : "site-button w-full text-center"}
        >
          {plan.cta.label}
        </Link>
      </div>
    </div>
  );
}
