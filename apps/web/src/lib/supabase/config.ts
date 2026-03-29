const LOCAL_SITE_URL = "http://127.0.0.1:3000";

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!publishableKey) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  return {
    url,
    publishableKey,
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
