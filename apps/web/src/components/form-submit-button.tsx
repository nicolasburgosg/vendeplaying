"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function FormSubmitButton({
  children,
  pendingLabel,
  className = "site-button",
  disabled = false,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const blocked = pending || disabled;

  return (
    <button type="submit" className={className} disabled={blocked} aria-disabled={blocked}>
      {pending ? pendingLabel : children}
    </button>
  );
}
