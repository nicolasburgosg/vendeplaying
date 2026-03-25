import "server-only";

import { parse } from "csv-parse/sync";
import type { Json } from "@/lib/supabase/database.types";
import { enqueueScheduledJob } from "@/lib/server/jobs";

type CatalogImportSummary = {
  totalRows: number;
  headers: string[];
};

export function parseCatalogCsvPreview(csvText: string) {
  const records = parse(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const headers = records[0] ? Object.keys(records[0]) : [];

  return {
    totalRows: records.length,
    headers,
  } satisfies CatalogImportSummary;
}

export function getCatalogImportSummaryJson(summary: CatalogImportSummary) {
  return {
    headers: summary.headers,
    total_rows: summary.totalRows,
  } satisfies Json;
}

export async function queueCatalogImport(params: {
  organizationId: string;
  importJobId: string;
  csvText: string;
  originalFilename: string | null;
}) {
  await enqueueScheduledJob({
    organizationId: params.organizationId,
    jobType: "refresh_catalog",
    dedupeKey: `${params.organizationId}:catalog-import:${params.importJobId}`,
    payload: {
      importJobId: params.importJobId,
      csvText: params.csvText,
      originalFilename: params.originalFilename,
    },
  });
}
