/**
 * search_docs tool - Full-text search across scraped documentation
 */

import * as fs from "fs/promises";
import * as path from "path";
import type { SearchResult, SearchOptions, DocsIndex, ScrapeMetadata } from "../types.js";

const DOCS_DIR = path.join(process.env.HOME ?? "~", "scraped-docs");

/**
 * Extract a snippet around the matched text
 */
function extractSnippet(content: string, query: string, contextChars: number = 150): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);

  if (matchIndex === -1) {
    // Return the beginning of the content if no match
    return content.slice(0, contextChars * 2) + (content.length > contextChars * 2 ? "..." : "");
  }

  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(content.length, matchIndex + query.length + contextChars);

  let snippet = content.slice(start, end);

  // Add ellipsis if we're not at the boundaries
  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet.replace(/\n+/g, " ").trim();
}

/**
 * Calculate a simple relevance score
 */
function calculateScore(content: string, query: string): number {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const words = lowerQuery.split(/\s+/).filter(Boolean);

  let score = 0;

  // Exact phrase match (highest value)
  if (lowerContent.includes(lowerQuery)) {
    score += 100;
    // Count occurrences
    const regex = new RegExp(lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const matches = content.match(regex);
    score += (matches?.length ?? 0) * 10;
  }

  // Individual word matches
  for (const word of words) {
    if (word.length < 2) continue;
    const wordRegex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const wordMatches = content.match(wordRegex);
    score += (wordMatches?.length ?? 0) * 5;
  }

  // Title match bonus (if query appears in first 200 chars, likely title/header area)
  if (lowerContent.slice(0, 200).includes(lowerQuery)) {
    score += 50;
  }

  return score;
}

/**
 * Search across all scraped documentation
 */
export async function searchDocs(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const { limit = 20, domain: filterDomain, tags: filterTags, caseSensitive = false } = options;

  if (!query || query.trim().length === 0) {
    throw new Error("Search query cannot be empty");
  }

  const results: SearchResult[] = [];
  const indexPath = path.join(DOCS_DIR, "index.json");

  // Load the index to get list of domains
  let domains: string[] = [];
  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: DocsIndex = JSON.parse(indexContent);
    domains = Object.keys(index.sites);

    // Filter by domain if specified
    if (filterDomain) {
      domains = domains.filter((d) => d === filterDomain || d.includes(filterDomain));
    }

    // Filter by tags if specified
    if (filterTags && filterTags.length > 0) {
      domains = domains.filter((d) => {
        const site = index.sites[d];
        return site.tags?.some((t) => filterTags.includes(t));
      });
    }
  } catch {
    throw new Error("No scraped documentation found. Use scrape_docs to scrape some documentation first.");
  }

  // Search each domain
  for (const domain of domains) {
    const domainDir = path.join(DOCS_DIR, domain);

    // Load metadata for this domain
    let metadata: ScrapeMetadata | null = null;
    try {
      const metadataContent = await fs.readFile(path.join(domainDir, "_metadata.json"), "utf-8");
      metadata = JSON.parse(metadataContent);
    } catch {
      // Continue without metadata
    }

    // Get all markdown files
    let files: string[] = [];
    try {
      const entries = await fs.readdir(domainDir);
      files = entries.filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }

    // Search each file
    for (const file of files) {
      try {
        const filePath = path.join(domainDir, file);
        const content = await fs.readFile(filePath, "utf-8");

        const searchContent = caseSensitive ? content : content.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();

        if (searchContent.includes(searchQuery)) {
          const score = calculateScore(content, query);
          const pageInfo = metadata?.pages.find((p) => p.path === file);

          results.push({
            domain,
            path: file,
            title: pageInfo?.title ?? file.replace(".md", "").replace(/_/g, " "),
            snippet: extractSnippet(content, query),
            score,
            sourceUrl: pageInfo?.sourceUrl ?? "",
          });
        }
      } catch {
        // Skip files that can't be read
        continue;
      }
    }
  }

  // Sort by score (descending) and limit results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Get statistics about the scraped documentation
 */
export async function getStats(): Promise<{
  totalDomains: number;
  totalPages: number;
  totalWordCount: number;
  domains: Array<{ domain: string; pages: number; words: number }>;
}> {
  const indexPath = path.join(DOCS_DIR, "index.json");

  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: DocsIndex = JSON.parse(indexContent);

    const domains: Array<{ domain: string; pages: number; words: number }> = [];
    let totalPages = 0;
    let totalWordCount = 0;

    for (const [domain, info] of Object.entries(index.sites)) {
      totalPages += info.pageCount;
      totalWordCount += info.totalWordCount ?? 0;
      domains.push({
        domain,
        pages: info.pageCount,
        words: info.totalWordCount ?? 0,
      });
    }

    return {
      totalDomains: domains.length,
      totalPages,
      totalWordCount,
      domains,
    };
  } catch {
    return {
      totalDomains: 0,
      totalPages: 0,
      totalWordCount: 0,
      domains: [],
    };
  }
}
