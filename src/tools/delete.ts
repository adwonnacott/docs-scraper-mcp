/**
 * delete_docs tool - Delete scraped documentation
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { DocsIndex } from "../types.js";

const DOCS_DIR = path.join(process.env.HOME ?? "~", "scraped-docs");

export interface DeleteResult {
  domain: string;
  pagesDeleted: number;
  localDeleted: boolean;
}

/**
 * Delete a scraped documentation domain
 */
export async function deleteDocs(domain: string): Promise<DeleteResult> {
  const domainDir = path.join(DOCS_DIR, domain);
  const indexPath = path.join(DOCS_DIR, "index.json");

  // Check if domain exists
  try {
    await fs.access(domainDir);
  } catch {
    throw new Error(`Domain "${domain}" not found. Use list_docs to see available domains.`);
  }

  // Count pages before deletion
  let pagesDeleted = 0;
  try {
    const files = await fs.readdir(domainDir);
    pagesDeleted = files.filter((f) => f.endsWith(".md")).length;
  } catch {
    // Ignore counting errors
  }

  // Delete the domain directory
  await fs.rm(domainDir, { recursive: true, force: true });

  // Update the index
  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: DocsIndex = JSON.parse(indexContent);

    if (index.sites && index.sites[domain]) {
      delete index.sites[domain];
      index.lastUpdated = new Date().toISOString();
      await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");
    }
  } catch {
    // Index might not exist or be malformed, that's okay
  }

  return {
    domain,
    pagesDeleted,
    localDeleted: true,
  };
}

/**
 * Delete all scraped documentation
 */
export async function deleteAllDocs(): Promise<{ domainsDeleted: number; totalPagesDeleted: number }> {
  const indexPath = path.join(DOCS_DIR, "index.json");

  let domainsDeleted = 0;
  let totalPagesDeleted = 0;

  try {
    const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const domainDir = path.join(DOCS_DIR, entry.name);
        const files = await fs.readdir(domainDir);
        totalPagesDeleted += files.filter((f) => f.endsWith(".md")).length;
        await fs.rm(domainDir, { recursive: true, force: true });
        domainsDeleted++;
      }
    }

    // Reset the index
    const emptyIndex: DocsIndex = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      sites: {},
    };
    await fs.writeFile(indexPath, JSON.stringify(emptyIndex, null, 2), "utf-8");
  } catch {
    // Directory might not exist
  }

  return { domainsDeleted, totalPagesDeleted };
}
