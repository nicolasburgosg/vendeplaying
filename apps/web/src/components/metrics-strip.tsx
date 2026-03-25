"use client";

import { useRef, useEffect, useState } from "react";
import { useInView } from "motion/react";

const metrics = [
  { value: 400, suffix: "K+", label: "negocios usan WhatsApp Business en RD" },
  { value: 85, suffix: "%", label: "de la economia dominicana es informal" },
  { value: 24, suffix: "/7", label: "tu agente de ventas nunca descansa" },
];

function useCountUp(target: number, active: boolean, duration = 1200) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    let raf: number;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);

  return count;
}

function MetricItem({
  value,
  suffix,
  label,
  active,
  showDivider,
}: {
  value: number;
  suffix: string;
  label: string;
  active: boolean;
  showDivider: boolean;
}) {
  const count = useCountUp(value, active);

  return (
    <div
      className={`py-10 text-center${showDivider ? " sm:border-l sm:border-dashed" : ""}`}
      style={showDivider ? { borderColor: "var(--grid-dash)" } : undefined}
    >
      <p className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        {count}
        {suffix}
      </p>
      <p className="mt-2 font-mono text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
    </div>
  );
}

export function MetricsStrip() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <section ref={ref} className="dash-border-t dash-border-b">
      <div className="site-shell">
        <p className="pt-8 text-center font-mono text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Hecho para negocios reales en RD
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {metrics.map((m, i) => (
            <MetricItem key={m.label} {...m} active={inView} showDivider={i > 0} />
          ))}
        </div>
      </div>
    </section>
  );
}
