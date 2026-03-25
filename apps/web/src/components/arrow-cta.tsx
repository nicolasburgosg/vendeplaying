"use client";

import Link from "next/link";
import { useRef, useEffect, useState } from "react";

const CTA_ARROW_SIZE = 48;
const CTA_DURATION = "400ms";
const CTA_EASING = "cubic-bezier(0.71, 0, 0.45, 1)";

export function ArrowCTA({
  label,
  href,
  variant = "dark",
  onClick,
  className = "",
}: {
  label: string;
  href: string;
  variant?: "dark" | "outline";
  onClick?: () => void;
  className?: string;
}) {
  const isDark = variant === "dark";
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const [hovered, setHovered] = useState(false);
  const [slideDistance, setSlideDistance] = useState(0);

  useEffect(() => {
    if (buttonRef.current) {
      const buttonWidth = buttonRef.current.offsetWidth;
      const offset = 3;
      setSlideDistance(buttonWidth - CTA_ARROW_SIZE + offset);
    }
  }, [label, isDark]);

  const transition = `transform ${CTA_DURATION} ${CTA_EASING}`;

  return (
    <Link
      ref={buttonRef}
      href={href}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`${isDark ? "bg-foreground" : "border-[1.5px] border-foreground"} relative inline-flex items-stretch overflow-hidden font-mono font-semibold uppercase tracking-[0.08em] ${className}`}
      style={{ color: isDark ? "var(--background)" : "var(--foreground)" }}
    >
      <span
        className="pointer-events-none absolute z-10 flex items-center justify-center"
        style={{
          width: `${CTA_ARROW_SIZE}px`,
          top: "-1.5px",
          bottom: "-1.5px",
          left: "-1.5px",
          background: isDark ? "var(--foreground)" : "var(--background)",
          borderLeft: `1.5px solid ${isDark ? "#F1F1F0" : "var(--foreground)"}`,
          borderRight: `1.5px solid ${isDark ? "#F1F1F0" : "var(--foreground)"}`,
          borderTop: isDark ? "none" : `1.5px solid var(--foreground)`,
          borderBottom: isDark ? "none" : `1.5px solid var(--foreground)`,
          transition,
          transform: hovered ? `translateX(${slideDistance}px)` : "translateX(0)",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </span>

      <span
        className="pointer-events-none py-4 px-6 text-[0.85rem]"
        style={{
          marginLeft: `${CTA_ARROW_SIZE}px`,
          transition,
          transform: hovered ? `translateX(-${CTA_ARROW_SIZE}px)` : "translateX(0)",
        }}
      >
        {label}
      </span>
    </Link>
  );
}
