const LOCAL_SITE_URL = "http://127.0.0.1:3000";

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabasePublicEnv() {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  };
}

export function getSiteUrl() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/+$/, "");
  }

  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();

  if (renderExternalUrl) {
    const normalized = renderExternalUrl.startsWith("http")
      ? renderExternalUrl
      : `https://${renderExternalUrl}`;

    return normalized.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing NEXT_PUBLIC_SITE_URL in production.");
  }

  return LOCAL_SITE_URL;
}
