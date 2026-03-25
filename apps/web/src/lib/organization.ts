import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ActiveMembership = Pick<
  Database["public"]["Tables"]["organization_memberships"]["Row"],
  "organization_id" | "role"
>;

function normalizeSlugSegment(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 42);

  return slug || "negocio";
}

function buildOrganizationSlug(name: string, userId: string, attempt: number) {
  const base = normalizeSlugSegment(name);

  if (attempt === 0) {
    return base;
  }

  const suffix = attempt === 1 ? userId.slice(0, 6) : `${userId.slice(0, 4)}-${attempt}`;
  return `${base}-${suffix}`.slice(0, 50);
}

function getOrganizationNameFromMetadata(user: User) {
  const organizationName = user.user_metadata?.organization_name;

  return typeof organizationName === "string" ? organizationName.trim() : "";
}

function isSlugConflict(message?: string | null, details?: string | null) {
  const combined = `${message ?? ""} ${details ?? ""}`.toLowerCase();

  return (
    combined.includes("organizations_slug_key") ||
    combined.includes("duplicate key") ||
    combined.includes("already exists")
  );
}

export async function getActiveMembership(
  supabase: SupabaseServerClient,
  userId: string,
) {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as ActiveMembership | null;
}

export async function ensureOrganizationForUser(
  supabase: SupabaseServerClient,
  user: User,
  organizationName?: string,
) {
  const requestedName = organizationName?.trim() || getOrganizationNameFromMetadata(user);

  if (!requestedName) {
    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase.rpc("bootstrap_organization", {
      _name: requestedName,
      _slug: buildOrganizationSlug(requestedName, user.id, attempt),
      _default_locale: "es-DO",
    });

    if (!error) {
      return data;
    }

    if (isSlugConflict(error.message, error.details)) {
      continue;
    }

    throw new Error(error.message);
  }

  throw new Error("No se pudo generar un slug único para la organización.");
}
