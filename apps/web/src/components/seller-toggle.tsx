"use client";

import { toggleSellerActiveAction } from "@/app/app/actions";

export function SellerToggle({ isActive }: { isActive: boolean }) {
  return (
    <form action={toggleSellerActiveAction} className="flex items-center gap-2">
      <input type="hidden" name="currentlyActive" value={String(isActive)} />
      <button
        type="submit"
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          isActive ? "border-accent bg-accent" : "border-muted bg-transparent"
        }`}
      >
        <span
          className={`absolute inset-y-0 my-auto left-0.5 h-3.5 w-3.5 rounded-full transition-transform ${
            isActive ? "translate-x-4 bg-white" : "translate-x-0 bg-muted"
          }`}
        />
      </button>
      <span className="text-sm font-medium">
        {isActive ? "Agente activo" : "Agente pausado"}
      </span>
    </form>
  );
}
