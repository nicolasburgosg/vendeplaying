"use client";

import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { useDialKit } from "dialkit";

export function VisualBreak() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  const spacing = useDialKit("Demo Section", {
    topPadding: [0, 0, 200],
  });

  return (
    <section ref={ref} style={{ paddingTop: `${spacing.topPadding}px` }}>
      <motion.div
        style={{ height: "1075px" }}
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
      >
        <iframe
          src="/product-demo.html"
          title="VendeTo' producto demo"
          className="h-full w-full border-0"
          scrolling="no"
          style={{ overflow: "hidden" }}
          loading="lazy"
        />
      </motion.div>
    </section>
  );
}
