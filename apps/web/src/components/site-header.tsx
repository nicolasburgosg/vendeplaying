"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { BrandLockup } from "@/components/brand-lockup";

const navLinks = [
  { href: "/#como-funciona", label: "Como Funciona" },
  { href: "/precios", label: "Precios" },
  { href: "/demo", label: "Contacto" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 transition-[border-color] duration-200"
      style={{
        backgroundColor: "#F1F1F0",
        borderBottom: scrolled ? "1px solid var(--line)" : "1px solid transparent",
      }}
    >
      <div className="site-shell flex items-center py-4">
        <BrandLockup />

        {/* Desktop nav — links left, CTA right */}
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex ml-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-block text-muted transition-all duration-200 ease-out hover:text-foreground hover:scale-105"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="inline-block text-muted transition-all duration-200 ease-out hover:text-foreground hover:scale-105"
          >
            Entrar
          </Link>
        </nav>

        <div className="hidden md:flex ml-auto">
          <Link href="/registro" className="site-button">
            Empezar
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {menuOpen ? (
              <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="border-t border-line bg-background px-6 pb-6 pt-4 md:hidden">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="text-sm font-medium text-muted"
              onClick={() => setMenuOpen(false)}
            >
              Entrar
            </Link>
            <Link
              href="/registro"
              className="site-button w-full text-center"
              onClick={() => setMenuOpen(false)}
            >
              Empezar
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
