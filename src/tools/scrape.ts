/**
 * scrape_docs tool - Scrape documentation from a URL
 * Enhanced with better metadata, word counting, and version tracking
 */

import * as fs from "fs/promises";
import * as path from "path";
import { FirecrawlService, CrawlOptions } from "../services/firecrawl.js";
import { GitHubService } from "../services/github.js";
import type { ScrapeMetadata, ScrapeResult, DocsIndex, Action, ScrapedPage } from "../types.js";

const DOCS_DIR = path.join(process.env.HOME ?? "~", "scraped-docs");

export interface ScrapeOptions {
  /** Maximum number of pages to scrape */
  limit: number;
  /** Milliseconds to wait for JS to render */
  waitFor?: number;
  /** Actions to perform before scraping */
  actions?: Action[];
  /** URL patterns to include (glob patterns) */
  includePaths?: string[];
  /** URL patterns to exclude (glob patterns) */
  excludePaths?: string[];
  /** Maximum depth to crawl from the starting URL */
  maxDepth?: number;
  /** Tags to categorize this scrape */
  tags?: string[];
  /** Whether to skip GitHub backup */
  skipGitHub?: boolean;
}

/**
 * Convert a URL to a domain identifier (for folder naming)
 */
function urlToDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/\./g, "-");
}

/**
 * Convert a source URL to a filename
 */
function urlToFilename(sourceUrl: string, baseUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);

    // Get the path relative to the base
    let relativePath = parsed.pathname;

    // Remove leading slash and trailing slash
    relativePath = relativePath.replace(/^\//, "").replace(/\/$/, "");

    // If empty, use "index"
    if (!relativePath) {
      return "index.md";
    }

    // Replace slashes with underscores and add .md
    // Also handle query params and hash for uniqueness
    let filename = relativePath.replace(/\//g, "_");

    if (parsed.search) {
      filename += "_" + parsed.search.replace(/[?&=]/g, "_").replace(/_+/g, "_");
    }

    if (parsed.hash) {
      filename += "_" + parsed.hash.replace("#", "");
    }

    return filename.slice(0, 200) + ".md"; // Limit filename length
  } catch {
    return "page.md";
  }
}

/**
 * Count words in markdown content
 */
function countWords(content: string): number {
  // Remove markdown syntax, code blocks, etc.
  const cleaned = content
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/`[^`]+`/g, "") // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to text
    .replace(/[#*_~`>]/g, "") // Remove markdown symbols
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract description from markdown content
 */
function extractDescription(content: string, maxLength: number = 200): string {
  // Try to find the first paragraph after any heading
  const lines = content.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headings, code, and other markdown elements
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("```") ||
      trimmed.startsWith("|") ||
      trimmed.startsWith("-") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith(">") ||
      trimmed.startsWith("!")
    ) {
      continue;
    }

    // Found a paragraph
    if (trimmed.length > 20) {
      const cleaned = trimmed
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`]/g, "");

      return cleaned.length > maxLength
        ? cleaned.slice(0, maxLength - 3) + "..."
        : cleaned;
    }
  }

  return "";
}

/**
 * Scrape documentation from a URL
 */
export async function scrapeDocs(
  url: string,
  options: ScrapeOptions,
  firecrawlApiKey: string,
  githubToken: string,
  githubRepo: string
): Promise<ScrapeResult> {
  const startTime = Date.now();
  const firecrawl = new FirecrawlService(firecrawlApiKey);
  const github = new GitHubService(githubToken, githubRepo);

  // Build crawl options
  const crawlOptions: CrawlOptions = {
    limit: options.limit,
    waitFor: options.waitFor,
    actions: options.actions,
    includePaths: options.includePaths,
    excludePaths: options.excludePaths,
    maxDepth: options.maxDepth,
  };

  // Crawl the site
  console.error(`Starting crawl of ${url} with limit ${options.limit}...`);
  if (options.waitFor) {
    console.error(`Using waitFor: ${options.waitFor}ms`);
  }
  if (options.actions && options.actions.length > 0) {
    console.error(`Using ${options.actions.length} actions for SPA support`);
  }
  if (options.includePaths) {
    console.error(`Include patterns: ${options.includePaths.join(", ")}`);
  }
  if (options.excludePaths) {
    console.error(`Exclude patterns: ${options.excludePaths.join(", ")}`);
  }

  const pages = await firecrawl.crawl(url, crawlOptions);
  console.error(`Crawl complete. Found ${pages.length} pages.`);

  const domain = urlToDomain(url);
  const domainDir = path.join(DOCS_DIR, domain);

  // Ensure directories exist
  await fs.mkdir(domainDir, { recursive: true });

  // Get existing metadata to determine version
  let existingVersion = 0;
  try {
    const existingMetadata = await fs.readFile(path.join(domainDir, "_metadata.json"), "utf-8");
    const parsed = JSON.parse(existingMetadata);
    existingVersion = parsed.version ?? 0;
  } catch {
    // No existing metadata
  }

  // Prepare files for local storage and GitHub
  const files: { path: string; content: string }[] = [];
  const scrapedPages: ScrapedPage[] = [];
  let totalWordCount = 0;

  // Track unique filenames to avoid collisions
  const usedFilenames = new Set<string>();

  for (const page of pages) {
    const sourceUrl = page.metadata?.sourceURL ?? url;
    const title = page.metadata?.title ?? "Untitled";
    const markdown = page.markdown ?? "";

    let filename = urlToFilename(sourceUrl, url);

    // Handle filename collisions
    let counter = 1;
    while (usedFilenames.has(filename)) {
      const ext = ".md";
      const base = filename.slice(0, -ext.length);
      filename = `${base}_${counter}${ext}`;
      counter++;
    }
    usedFilenames.add(filename);

    const filePath = path.join(domainDir, filename);
    const wordCount = countWords(markdown);
    const description = extractDescription(markdown);

    totalWordCount += wordCount;

    // Save locally
    await fs.writeFile(filePath, markdown, "utf-8");

    // Add to GitHub commit list
    files.push({
      path: `${domain}/${filename}`,
      content: markdown,
    });

    scrapedPages.push({
      path: filename,
      sourceUrl,
      title,
      description,
      wordCount,
    });
  }

  // Build metadata
  const metadata: ScrapeMetadata = {
    domain,
    sourceUrl: url,
    scrapedAt: new Date().toISOString(),
    pageCount: pages.length,
    totalWordCount,
    pages: scrapedPages,
    tags: options.tags,
    version: existingVersion + 1,
    scrapeOptions: {
      limit: options.limit,
      waitFor: options.waitFor,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths,
      maxDepth: options.maxDepth,
    },
  };

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
  let index: DocsIndex = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    sites: {},
  };

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
    tags: options.tags,
    version: metadata.version,
    totalWordCount,
  };
  index.lastUpdated = new Date().toISOString();

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

  files.push({
    path: "index.json",
    content: JSON.stringify(index, null, 2),
  });

  // Commit to GitHub (unless skipped)
  if (!options.skipGitHub) {
    console.error(`Committing ${files.length} files to GitHub...`);
    await github.commitFiles(
      files,
      `docs: scraped ${domain} v${metadata.version} (${pages.length} pages, ${totalWordCount} words)`
    );
    console.error("GitHub commit complete.");
  }

  const duration = Date.now() - startTime;

  return {
    domain,
    pageCount: pages.length,
    localPath: domainDir,
    githubUrl: `https://github.com/${githubRepo}/tree/main/${domain}`,
    totalWordCount,
    duration,
  };
}
