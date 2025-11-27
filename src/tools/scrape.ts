/**
 * scrape_docs tool - Scrape documentation from a URL
 */

import * as fs from "fs/promises";
import * as path from "path";
import { FirecrawlService } from "../services/firecrawl.js";
import { GitHubService } from "../services/github.js";

const DOCS_DIR = path.join(process.env.HOME ?? "~", "scraped-docs");

interface ScrapeResult {
  domain: string;
  pageCount: number;
  localPath: string;
  githubUrl: string;
}

function urlToDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/\./g, "-");
}

function urlToFilename(sourceUrl: string, baseUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    const baseParsed = new URL(baseUrl);

    // Get the path relative to the base
    let relativePath = parsed.pathname;

    // Remove leading slash and trailing slash
    relativePath = relativePath.replace(/^\//, "").replace(/\/$/, "");

    // If empty, use "index"
    if (!relativePath) {
      return "index.md";
    }

    // Replace slashes with underscores and add .md
    return relativePath.replace(/\//g, "_") + ".md";
  } catch {
    return "page.md";
  }
}

export async function scrapeDocs(
  url: string,
  limit: number,
  firecrawlApiKey: string,
  githubToken: string,
  githubRepo: string
): Promise<ScrapeResult> {
  const firecrawl = new FirecrawlService(firecrawlApiKey);
  const github = new GitHubService(githubToken, githubRepo);

  // Crawl the site
  console.error(`Starting crawl of ${url} with limit ${limit}...`);
  const pages = await firecrawl.crawl(url, { limit });
  console.error(`Crawl complete. Found ${pages.length} pages.`);

  const domain = urlToDomain(url);
  const domainDir = path.join(DOCS_DIR, domain);

  // Ensure directories exist
  await fs.mkdir(domainDir, { recursive: true });

  // Prepare files for local storage and GitHub
  const files: { path: string; content: string }[] = [];
  const metadata = {
    domain,
    sourceUrl: url,
    scrapedAt: new Date().toISOString(),
    pageCount: pages.length,
    pages: [] as { path: string; sourceUrl: string; title: string }[],
  };

  for (const page of pages) {
    const sourceUrl = page.metadata?.sourceURL ?? url;
    const title = page.metadata?.title ?? "Untitled";
    const markdown = page.markdown ?? "";

    const filename = urlToFilename(sourceUrl, url);
    const filePath = path.join(domainDir, filename);

    // Save locally
    await fs.writeFile(filePath, markdown, "utf-8");

    // Add to GitHub commit list
    files.push({
      path: `${domain}/${filename}`,
      content: markdown,
    });

    metadata.pages.push({
      path: filename,
      sourceUrl,
      title,
    });
  }

  // Save metadata locally
  const metadataPath = path.join(domainDir, "_metadata.json");
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

  // Add metadata to GitHub
  files.push({
    path: `${domain}/_metadata.json`,
    content: JSON.stringify(metadata, null, 2),
  });

  // Update master index
  const indexPath = path.join(DOCS_DIR, "index.json");
  let index: { sites: Record<string, { scrapedAt: string; pageCount: number; sourceUrl: string }> } = { sites: {} };

  try {
    const existing = await fs.readFile(indexPath, "utf-8");
    index = JSON.parse(existing);
  } catch {
    // Index doesn't exist yet
  }

  index.sites[domain] = {
    scrapedAt: metadata.scrapedAt,
    pageCount: metadata.pageCount,
    sourceUrl: url,
  };

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

  files.push({
    path: "index.json",
    content: JSON.stringify(index, null, 2),
  });

  // Commit to GitHub
  console.error(`Committing ${files.length} files to GitHub...`);
  await github.commitFiles(
    files,
    `docs: scraped ${domain} (${pages.length} pages)`
  );
  console.error("GitHub commit complete.");

  return {
    domain,
    pageCount: pages.length,
    localPath: domainDir,
    githubUrl: `https://github.com/${githubRepo}/tree/main/${domain}`,
  };
}
