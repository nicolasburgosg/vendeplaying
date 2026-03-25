"use client";

import { useRef, useEffect, Fragment, useCallback } from "react";
import { motion, useInView } from "motion/react";
import { useDialKit } from "dialkit";
import { ArrowCTA } from "@/components/arrow-cta";

/* ── Masked Text Reveal ── */

function detectLines(spans: HTMLSpanElement[]): number[][] {
  const lines: number[][] = [[]];
  let currentTop = spans[0].getBoundingClientRect().top;
  lines[0].push(0);

  for (let i = 1; i < spans.length; i++) {
    const top = spans[i].getBoundingClientRect().top;
    if (Math.abs(top - currentTop) > 2) {
      lines.push([i]);
      currentTop = top;
    } else {
      lines[lines.length - 1].push(i);
    }
  }
  return lines;
}

function buildWordMasks(
  container: HTMLElement,
  words: string[],
  lines: number[][]
) {
  container.textContent = "";
  const wordEls: HTMLElement[] = [];

  for (const indices of lines) {
    const mask = document.createElement("div");
    mask.style.overflow = "hidden";

    indices.forEach((wordIdx, j) => {
      const wordEl = document.createElement("span");
      wordEl.style.display = "inline-block";
      wordEl.style.transform = "translateY(110%)";
      wordEl.style.transition = "transform 0.9s cubic-bezier(0.16, 1, 0.3, 1)";
      wordEl.textContent = words[wordIdx];
      mask.appendChild(wordEl);
      wordEls.push(wordEl);

      if (j < indices.length - 1) {
        mask.appendChild(document.createTextNode("\u00A0"));
      }
    });

    container.appendChild(mask);
  }
  return wordEls;
}

function MaskedHeadline({
  text,
  className,
  trigger,
}: {
  text: string;
  className?: string;
  trigger: boolean;
}) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  const wordSpanRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const builtEls = useRef<HTMLElement[]>([]);
  const isBuilt = useRef(false);
  const hasPlayed = useRef(false);

  const words = text.split(" ");

  const WORD_STAGGER = 0.07;
  const LINE_GAP = 0.1;

  const buildAndAnimate = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!isBuilt.current) {
      const spans = wordSpanRefs.current.filter(Boolean) as HTMLSpanElement[];
      if (spans.length === 0) return;
      const lines = detectLines(spans);
      builtEls.current = buildWordMasks(el, words, lines);
      isBuilt.current = true;
      el.style.visibility = "visible";
    }

    const el2 = containerRef.current;
    if (!el2) return;
    const masks = Array.from(el2.children) as HTMLElement[];
    let t = 0;
    const delays: number[] = [];

    for (const mask of masks) {
      const wordCount = mask.querySelectorAll("span").length;
      for (let j = 0; j < wordCount; j++) {
        delays.push(t);
        t += WORD_STAGGER;
      }
      t += LINE_GAP;
    }

    builtEls.current.forEach((wordEl, i) => {
      wordEl.style.transitionDelay = `${delays[i]}s`;
      requestAnimationFrame(() => {
        wordEl.style.transform = "translateY(0%)";
      });
    });
  }, [words]);

  useEffect(() => {
    if (trigger && !hasPlayed.current) {
      hasPlayed.current = true;
      requestAnimationFrame(() => buildAndAnimate());
    }
  }, [trigger, buildAndAnimate]);

  return (
    <h1
      ref={containerRef}
      className={className}
      style={{ visibility: "hidden" }}
    >
      {words.map((word, i) => (
        <Fragment key={i}>
          <span
            ref={(el) => {
              wordSpanRefs.current[i] = el;
            }}
          >
            {word}
          </span>
          {i < words.length - 1 && " "}
        </Fragment>
      ))}
    </h1>
  );
}

/* ── Hero Section ── */

export function HeroSection() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });

  const illustration = useDialKit("Illustration", {
    offsetX: [0, -400, 400],
    offsetY: [-140, -400, 400],
    scale: [1.9, 0.3, 3],
  });

  const heroSpacing = useDialKit("Hero Spacing", {
    topPadding: [60, 0, 200],
    headlineGap: [44, 0, 100],
  });

  const ctaPos = useDialKit("CTA Buttons", {
    offsetX: [0, -200, 200],
    offsetY: [-140, -200, 200],
  });

  return (
    <section ref={ref} className="pb-32 lg:pb-40" style={{ paddingTop: `${heroSpacing.topPadding}px` }}>
      <div className="site-shell">
        {/* Headline + subheadline — same flow, one thought */}
        <MaskedHeadline
          text="Tu vendedor de WhatsApp que nunca duerme."
          className="site-display text-5xl tracking-tight sm:text-6xl md:text-7xl lg:text-[5.5rem]"
          trigger={inView}
        />

        <motion.p
          className="mb-6 max-w-xl text-[1.25rem] leading-[1.7] text-foreground/70"
          style={{ marginTop: `${heroSpacing.headlineGap}px` }}
          initial={{ opacity: 0, y: 8 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.35, delay: 0.6 }}
        >
          VendeTo&apos; es un agente de ventas con IA que responde, recomienda
          productos y cobra a tus clientes por WhatsApp. Todo automatico, 24/7.
        </motion.p>

        {/* Two-col: CTAs left, illustration right */}
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div
            className="space-y-6"
            style={{ transform: `translate(${ctaPos.offsetX}px, ${ctaPos.offsetY}px)` }}
          >
            <motion.div
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
              initial={{ opacity: 0, y: 8 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.3, delay: 0.75 }}
            >
              <ArrowCTA
                label="Crea tu Agente IA"
                href="/registro"
                variant="dark"
              />
              <ArrowCTA
                label="Ver como funciona"
                href="#como-funciona"
                variant="outline"
              />
            </motion.div>

          </div>

          {/* Illustration */}
          <motion.div
            className="flex justify-center lg:justify-end"
            initial={{ opacity: 0, x: 20 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero_v03.svg"
              alt="VendeTo' — agente de ventas por WhatsApp con IA"
              width={520}
              height={520}
              className="w-full max-w-[520px]"
              style={{
                transform: `translate(${illustration.offsetX}px, ${illustration.offsetY}px) scale(${illustration.scale})`,
              }}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
