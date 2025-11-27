#!/usr/bin/env node
/**
 * docs-scraper MCP Server
 *
 * A production-quality MCP server for scraping documentation with Firecrawl
 * and storing in GitHub. Features include:
 * - Standard and SPA scraping modes
 * - Full-text search across scraped docs
 * - Tagging and version tracking
 * - URL pattern filtering
 * - Word count and metadata extraction
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { scrapeDocs } from "./tools/scrape.js";
import { listDocs } from "./tools/list.js";
import { getDoc } from "./tools/get.js";
import { deleteDocs, deleteAllDocs } from "./tools/delete.js";
import { searchDocs, getStats } from "./tools/search.js";
import type { Action } from "./types.js";

// Environment variables
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

if (!FIRECRAWL_API_KEY) {
  console.error("Error: FIRECRAWL_API_KEY environment variable is required");
  process.exit(1);
}

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

if (!GITHUB_REPO) {
  console.error("Error: GITHUB_REPO environment variable is required");
  process.exit(1);
}

// Create MCP server
const server = new McpServer({
  name: "docs-scraper",
  version: "2.0.0",
});

// ============================================================================
// SCRAPING TOOLS
// ============================================================================

// Register scrape_docs tool
server.tool(
  "scrape_docs",
  "Scrape documentation from a URL using Firecrawl. Saves locally to ~/scraped-docs/ and backs up to GitHub. Supports URL filtering and tagging.",
  {
    url: z.string().url().describe("The URL to scrape (e.g., https://docs.example.com/)"),
    limit: z.number().min(1).max(500).default(100).describe("Maximum number of pages to scrape (default: 100)"),
    includePaths: z.array(z.string()).optional().describe("URL patterns to include (glob patterns, e.g., ['/api/*', '/guides/*'])"),
    excludePaths: z.array(z.string()).optional().describe("URL patterns to exclude (glob patterns, e.g., ['/blog/*', '/changelog/*'])"),
    maxDepth: z.number().min(1).max(10).optional().describe("Maximum depth to crawl from the starting URL"),
    tags: z.array(z.string()).optional().describe("Tags to categorize this documentation (e.g., ['api', 'javascript'])"),
  },
  async ({ url, limit, includePaths, excludePaths, maxDepth, tags }) => {
    try {
      const result = await scrapeDocs(
        url,
        {
          limit: limit ?? 100,
          includePaths,
          excludePaths,
          maxDepth,
          tags,
        },
        FIRECRAWL_API_KEY!,
        GITHUB_TOKEN!,
        GITHUB_REPO!
      );

      const durationSec = result.duration ? (result.duration / 1000).toFixed(1) : "?";

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully scraped ${result.pageCount} pages from ${result.domain}

📊 Stats:
- Pages: ${result.pageCount}
- Words: ${result.totalWordCount?.toLocaleString() ?? "N/A"}
- Duration: ${durationSec}s

📁 Local path: ${result.localPath}
🔗 GitHub: ${result.githubUrl}

Use list_docs to see all scraped documentation, get_doc to retrieve content, or search_docs to search.`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error scraping docs: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register scrape_spa tool for JavaScript-heavy sites
server.tool(
  "scrape_spa",
  "Scrape a JavaScript-heavy SPA/single-page application. Uses waitFor and actions to let JS render before scraping. Good for Stoplight, React, Vue, Angular docs.",
  {
    url: z.string().url().describe("The URL to scrape"),
    limit: z.number().min(1).max(500).default(100).describe("Maximum number of pages to scrape (default: 100)"),
    waitFor: z.number().min(0).max(30000).default(5000).describe("Milliseconds to wait for JS to render (default: 5000)"),
    clickSelector: z.string().optional().describe("Optional CSS selector to click before scraping (e.g., 'nav a' to expand navigation)"),
    scrollToBottom: z.boolean().default(false).describe("Scroll to bottom of page before scraping to trigger lazy loading"),
    includePaths: z.array(z.string()).optional().describe("URL patterns to include (glob patterns)"),
    excludePaths: z.array(z.string()).optional().describe("URL patterns to exclude (glob patterns)"),
    tags: z.array(z.string()).optional().describe("Tags to categorize this documentation"),
  },
  async ({ url, limit, waitFor, clickSelector, scrollToBottom, includePaths, excludePaths, tags }) => {
    try {
      // Build actions array for SPA handling
      const actions: Action[] = [];

      // Initial wait for JS to load
      actions.push({ type: "wait", milliseconds: waitFor ?? 5000 });

      // Optional: click to expand navigation
      if (clickSelector) {
        actions.push({ type: "click", selector: clickSelector });
        actions.push({ type: "wait", milliseconds: 1000 });
      }

      // Optional: scroll to trigger lazy loading
      if (scrollToBottom) {
        actions.push({ type: "scroll", direction: "down" });
        actions.push({ type: "wait", milliseconds: 2000 });
      }

      const result = await scrapeDocs(
        url,
        {
          limit: limit ?? 100,
          waitFor: waitFor ?? 5000,
          actions,
          includePaths,
          excludePaths,
          tags,
        },
        FIRECRAWL_API_KEY!,
        GITHUB_TOKEN!,
        GITHUB_REPO!
      );

      const durationSec = result.duration ? (result.duration / 1000).toFixed(1) : "?";

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully scraped ${result.pageCount} pages from ${result.domain} (SPA mode)

📊 Stats:
- Pages: ${result.pageCount}
- Words: ${result.totalWordCount?.toLocaleString() ?? "N/A"}
- Duration: ${durationSec}s
- Wait time: ${waitFor ?? 5000}ms
- Actions: ${actions.length}

📁 Local path: ${result.localPath}
🔗 GitHub: ${result.githubUrl}

Use list_docs to see all scraped documentation, get_doc to retrieve content, or search_docs to search.`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error scraping SPA: ${message}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// LISTING & RETRIEVAL TOOLS
// ============================================================================

// Register list_docs tool
server.tool(
  "list_docs",
  "List all scraped documentation sources with stats",
  {},
  async () => {
    try {
      const sites = await listDocs();

      if (sites.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No documentation has been scraped yet. Use scrape_docs to scrape some documentation.",
            },
          ],
        };
      }

      const lines = sites.map(
        (site) =>
          `📚 ${site.domain}
   Source: ${site.sourceUrl}
   Pages: ${site.pageCount}
   Scraped: ${new Date(site.scrapedAt).toLocaleDateString()}`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Scraped documentation (${sites.length} sources):\n\n${lines.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error listing docs: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register get_doc tool
server.tool(
  "get_doc",
  "Retrieve content from a scraped domain. If no path is specified, lists available documents.",
  {
    domain: z.string().describe("The domain to retrieve docs from (e.g., developer-timecamp-com)"),
    path: z.string().optional().describe("Specific document path (e.g., index.md or api_authentication)"),
  },
  async ({ domain, path }) => {
    try {
      const result = await getDoc(domain, path);

      if (Array.isArray(result)) {
        // List of available docs
        const lines = result.map((doc) => `- ${doc.path}\n  ${doc.content}`);
        return {
          content: [
            {
              type: "text" as const,
              text: `Available documents in ${domain} (${result.length} files):\n\n${lines.join("\n\n")}\n\nUse get_doc with a specific path to retrieve content.`,
            },
          ],
        };
      }

      // Single document
      return {
        content: [
          {
            type: "text" as const,
            text: result.content,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error getting doc: ${message}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// SEARCH TOOLS
// ============================================================================

// Register search_docs tool
server.tool(
  "search_docs",
  "Full-text search across all scraped documentation. Returns ranked results with snippets.",
  {
    query: z.string().min(1).describe("Search query"),
    domain: z.string().optional().describe("Filter results to a specific domain"),
    tags: z.array(z.string()).optional().describe("Filter by tags"),
    limit: z.number().min(1).max(100).default(20).describe("Maximum number of results (default: 20)"),
  },
  async ({ query, domain, tags, limit }) => {
    try {
      const results = await searchDocs(query, {
        domain,
        tags,
        limit: limit ?? 20,
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No results found for "${query}". Try different keywords or check available docs with list_docs.`,
            },
          ],
        };
      }

      const lines = results.map(
        (r, i) =>
          `${i + 1}. **${r.title}** (${r.domain}/${r.path})
   ${r.snippet}
   Score: ${r.score}`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} results for "${query}":\n\n${lines.join("\n\n")}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error searching docs: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register stats tool
server.tool(
  "docs_stats",
  "Get statistics about all scraped documentation",
  {},
  async () => {
    try {
      const stats = await getStats();

      if (stats.totalDomains === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No documentation has been scraped yet. Use scrape_docs to get started.",
            },
          ],
        };
      }

      const domainLines = stats.domains
        .sort((a, b) => b.pages - a.pages)
        .map((d) => `- ${d.domain}: ${d.pages} pages, ${d.words.toLocaleString()} words`);

      return {
        content: [
          {
            type: "text" as const,
            text: `📊 Documentation Statistics

Total domains: ${stats.totalDomains}
Total pages: ${stats.totalPages}
Total words: ${stats.totalWordCount.toLocaleString()}

By domain:
${domainLines.join("\n")}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error getting stats: ${message}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// DELETE TOOLS
// ============================================================================

// Register delete_docs tool
server.tool(
  "delete_docs",
  "Delete scraped documentation for a specific domain",
  {
    domain: z.string().describe("The domain to delete (e.g., developer-timecamp-com)"),
    confirm: z.boolean().describe("Must be true to confirm deletion"),
  },
  async ({ domain, confirm }) => {
    if (!confirm) {
      return {
        content: [
          {
            type: "text" as const,
            text: `To delete ${domain}, call delete_docs with confirm=true`,
          },
        ],
      };
    }

    try {
      const result = await deleteDocs(domain);

      return {
        content: [
          {
            type: "text" as const,
            text: `Deleted ${result.domain}:
- Pages removed: ${result.pagesDeleted}
- Local files: deleted`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error deleting docs: ${message}` }],
        isError: true,
      };
    }
  }
);

// Register delete_all_docs tool
server.tool(
  "delete_all_docs",
  "Delete ALL scraped documentation (use with caution!)",
  {
    confirm: z.literal("DELETE ALL").describe("Must be exactly 'DELETE ALL' to confirm"),
  },
  async ({ confirm }) => {
    if (confirm !== "DELETE ALL") {
      return {
        content: [
          {
            type: "text" as const,
            text: `To delete all documentation, call delete_all_docs with confirm="DELETE ALL"`,
          },
        ],
      };
    }

    try {
      const result = await deleteAllDocs();

      return {
        content: [
          {
            type: "text" as const,
            text: `Deleted all documentation:
- Domains removed: ${result.domainsDeleted}
- Total pages removed: ${result.totalPagesDeleted}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error deleting all docs: ${message}` }],
        isError: true,
      };
    }
  }
);

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("docs-scraper MCP server v2.0.0 started");
  console.error(`Tools available: scrape_docs, scrape_spa, list_docs, get_doc, search_docs, docs_stats, delete_docs, delete_all_docs`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
