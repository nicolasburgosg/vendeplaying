export type AppFormState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const INITIAL_APP_FORM_STATE: AppFormState = {
  status: "idle",
};

export function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOptionalText(value: FormDataEntryValue | null) {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeEmail(value: FormDataEntryValue | null) {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export function normalizeStringList(value: FormDataEntryValue | null) {
  const raw = normalizeText(value);

  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseInteger(
  value: FormDataEntryValue | null,
  fallback = 0,
) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseDecimal(
  value: FormDataEntryValue | null,
  fallback = 0,
) {
  const normalized = normalizeText(value).replace(",", ".");

  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseJsonText(value: FormDataEntryValue | null): Json {
  const normalized = normalizeText(value);

  if (!normalized) {
    return {} as Json;
  }

  return JSON.parse(normalized) as Json;
}
import type { Json } from "@/lib/supabase/database.types";
