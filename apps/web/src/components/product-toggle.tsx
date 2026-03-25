"use client";

import { toggleProductStatusAction } from "@/app/app/actions";

export function ProductToggle({
  productId,
  currentStatus,
}: {
  productId: string;
  currentStatus: string;
}) {
  const isActive = currentStatus === "active";

  return (
    <form
      action={toggleProductStatusAction}
      onClick={(e) => e.stopPropagation()}
      className="mt-auto flex items-center gap-2 pt-2"
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="currentStatus" value={currentStatus} />
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
      <span className="text-xs text-muted">
        {isActive ? "Activo" : "Inactivo"}
      </span>
    </form>
  );
}
