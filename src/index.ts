#!/usr/bin/env node
/**
 * docs-scraper MCP Server
 *
 * Provides tools for scraping documentation with Firecrawl and storing in GitHub
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { scrapeDocs } from "./tools/scrape.js";
import { listDocs } from "./tools/list.js";
import { getDoc } from "./tools/get.js";

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
  version: "1.0.0",
});

// Register scrape_docs tool
server.tool(
  "scrape_docs",
  "Scrape documentation from a URL using Firecrawl. Saves locally to ~/scraped-docs/ and backs up to GitHub.",
  {
    url: z.string().url().describe("The URL to scrape (e.g., https://developer.timecamp.com/)"),
    limit: z.number().min(1).max(500).default(100).describe("Maximum number of pages to scrape (default: 100)"),
  },
  async ({ url, limit }) => {
    try {
      const result = await scrapeDocs(
        url,
        { limit: limit ?? 100 },
        FIRECRAWL_API_KEY!,
        GITHUB_TOKEN!,
        GITHUB_REPO!
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully scraped ${result.pageCount} pages from ${result.domain}

Local path: ${result.localPath}
GitHub: ${result.githubUrl}

Use list_docs to see all scraped documentation, or get_doc to retrieve specific pages.`,
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
  },
  async ({ url, limit, waitFor, clickSelector, scrollToBottom }) => {
    try {
      // Build actions array for SPA handling
      const actions: Array<{
        type: "wait" | "click" | "scroll";
        milliseconds?: number;
        selector?: string;
        direction?: "up" | "down";
      }> = [];

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
        },
        FIRECRAWL_API_KEY!,
        GITHUB_TOKEN!,
        GITHUB_REPO!
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Successfully scraped ${result.pageCount} pages from ${result.domain} (SPA mode)

Local path: ${result.localPath}
GitHub: ${result.githubUrl}

Used: waitFor=${waitFor ?? 5000}ms, ${actions.length} actions
Use list_docs to see all scraped documentation, or get_doc to retrieve specific pages.`,
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

// Register list_docs tool
server.tool(
  "list_docs",
  "List all scraped documentation sources",
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
          `- ${site.domain} (${site.pageCount} pages)\n  Source: ${site.sourceUrl}\n  Scraped: ${site.scrapedAt}`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Scraped documentation:\n\n${lines.join("\n\n")}`,
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
              text: `Available documents in ${domain}:\n\n${lines.join("\n\n")}\n\nUse get_doc with a specific path to retrieve content.`,
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

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("docs-scraper MCP server started");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
