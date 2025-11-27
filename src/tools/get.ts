/**
 * get_doc tool - Retrieve content from a scraped domain
 */

import * as fs from "fs/promises";
import * as path from "path";

const DOCS_DIR = path.join(process.env.HOME ?? "~", "scraped-docs");

interface DocContent {
  path: string;
  content: string;
}

interface Metadata {
  domain: string;
  sourceUrl: string;
  scrapedAt: string;
  pageCount: number;
  pages: { path: string; sourceUrl: string; title: string }[];
}

export async function getDoc(domain: string, docPath?: string): Promise<DocContent | DocContent[]> {
  const domainDir = path.join(DOCS_DIR, domain);

  // Check if domain exists
  try {
    await fs.access(domainDir);
  } catch {
    throw new Error(`Domain "${domain}" not found. Use list_docs to see available domains.`);
  }

  if (docPath) {
    // Get specific document
    const filePath = path.join(domainDir, docPath.endsWith(".md") ? docPath : `${docPath}.md`);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return { path: docPath, content };
    } catch {
      throw new Error(`Document "${docPath}" not found in domain "${domain}".`);
    }
  }

  // No path specified - return list of available docs
  const metadataPath = path.join(domainDir, "_metadata.json");

  try {
    const metadataContent = await fs.readFile(metadataPath, "utf-8");
    const metadata: Metadata = JSON.parse(metadataContent);

    return metadata.pages.map((page) => ({
      path: page.path,
      content: `Title: ${page.title}\nSource: ${page.sourceUrl}`,
    }));
  } catch {
    // Fallback: list files directly
    const files = await fs.readdir(domainDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    return mdFiles.map((f) => ({
      path: f,
      content: "(content available - specify path to retrieve)",
    }));
  }
}
