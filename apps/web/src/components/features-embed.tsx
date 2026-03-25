"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";

export function FeaturesEmbed() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <section ref={ref}>
      <motion.div
        style={{ height: "1800px" }}
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
      >
        <iframe
          src="/features-section.html"
          title="VendeTo' funcionalidades"
          className="h-full w-full border-0"
          scrolling="no"
          style={{ overflow: "hidden" }}
          loading="lazy"
        />
      </motion.div>
    </section>
  );
}
