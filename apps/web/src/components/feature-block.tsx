"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { IllustrationSlot } from "@/components/illustration-slot";

export interface Feature {
  kicker: string;
  title: string;
  description: string;
  cta?: { label: string; href: string };
  illustration?: string;
}

/* ── FeatureGrid — 2-column dashed-border grid ── */

export function FeatureGrid({ features }: { features: Feature[] }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <section ref={ref} className="site-section">
      <div className="site-shell">
        <h2 className="site-section-heading mb-12 text-center text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Todo lo que necesitas para vender por WhatsApp
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 dash-border-t dash-border-l">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="dash-border-r dash-border-b p-8 lg:p-10 space-y-4"
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <p className="site-kicker">{feature.kicker}</p>
              <h3 className="text-xl font-bold tracking-tight sm:text-2xl">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                {feature.description}
              </p>
              {feature.illustration && (
                <div className="mt-2 flex h-[120px] w-full items-center justify-center border border-dashed border-muted/30">
                  <span className="font-mono text-xs text-muted/40">ILLUSTRATION</span>
                </div>
              )}
              {feature.cta ? (
                <a href={feature.cta.href} className="site-mono-link inline-flex items-center gap-1.5">
                  {feature.cta.label} <span aria-hidden>&gt;</span>
                </a>
              ) : null}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Legacy FeatureBlock — kept for compatibility ── */

export function FeatureBlock({
  feature,
  reversed = false,
}: {
  feature: Feature;
  reversed?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });

  return (
    <motion.div
      ref={ref}
      className={`grid items-center gap-10 lg:grid-cols-2 ${
        reversed ? "lg:[&>*:first-child]:order-2" : ""
      }`}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
    >
      {/* Text */}
      <div className="space-y-4">
        <p className="site-kicker">{feature.kicker}</p>
        <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {feature.title}
        </h3>
        <p className="text-base leading-relaxed text-muted">
          {feature.description}
        </p>
        {feature.cta ? (
          <a
            href={feature.cta.href}
            className="site-mono-link inline-flex items-center gap-1.5"
          >
            {feature.cta.label} <span aria-hidden>&gt;</span>
          </a>
        ) : null}
      </div>

      {/* Illustration */}
      {feature.illustration && (
        <div className={`flex ${reversed ? "justify-start" : "justify-end"}`}>
          <IllustrationSlot
            width={400}
            height={300}
            label={feature.illustration}
            className="w-full max-w-[400px]"
          />
        </div>
      )}
    </motion.div>
  );
}
