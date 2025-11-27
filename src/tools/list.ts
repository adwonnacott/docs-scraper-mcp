/**
 * list_docs tool - List all scraped documentation sources
 */

import * as fs from "fs/promises";
import * as path from "path";

const DOCS_DIR = path.join(process.env.HOME ?? "~", "scraped-docs");

interface SiteInfo {
  domain: string;
  sourceUrl: string;
  scrapedAt: string;
  pageCount: number;
}

export async function listDocs(): Promise<SiteInfo[]> {
  const indexPath = path.join(DOCS_DIR, "index.json");

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    const index = JSON.parse(content) as {
      sites: Record<string, { scrapedAt: string; pageCount: number; sourceUrl: string }>;
    };

    return Object.entries(index.sites).map(([domain, info]) => ({
      domain,
      sourceUrl: info.sourceUrl,
      scrapedAt: info.scrapedAt,
      pageCount: info.pageCount,
    }));
  } catch {
    return [];
  }
}
