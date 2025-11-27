/**
 * Shared types for the docs-scraper MCP server
 */

// ============================================================================
// Action Types (for Firecrawl interactions)
// ============================================================================

export type ActionType = "wait" | "click" | "scroll" | "screenshot" | "executeJavascript" | "write" | "press";

export interface BaseAction {
  type: ActionType;
}

export interface WaitAction extends BaseAction {
  type: "wait";
  milliseconds: number;
}

export interface ClickAction extends BaseAction {
  type: "click";
  selector: string;
}

export interface ScrollAction extends BaseAction {
  type: "scroll";
  direction: "up" | "down";
  amount?: number;
}

export interface ScreenshotAction extends BaseAction {
  type: "screenshot";
}

export interface ExecuteJsAction extends BaseAction {
  type: "executeJavascript";
  script: string;
}

export interface WriteAction extends BaseAction {
  type: "write";
  text: string;
  selector?: string;
}

export interface PressAction extends BaseAction {
  type: "press";
  key: string;
}

export type Action = WaitAction | ClickAction | ScrollAction | ScreenshotAction | ExecuteJsAction | WriteAction | PressAction;

// ============================================================================
// Scrape Options
// ============================================================================

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
  /** Whether to follow links to external domains */
  allowExternalLinks?: boolean;
  /** Maximum depth to crawl from the starting URL */
  maxDepth?: number;
  /** Custom headers to send with requests */
  headers?: Record<string, string>;
  /** Tags to categorize this scrape */
  tags?: string[];
}

// ============================================================================
// Page Data (from Firecrawl)
// ============================================================================

export interface PageMetadata {
  sourceURL?: string;
  title?: string;
  description?: string;
  language?: string;
  ogImage?: string;
  statusCode?: number;
}

export interface PageData {
  markdown?: string;
  html?: string;
  metadata?: PageMetadata;
  links?: string[];
}

// ============================================================================
// Scrape Results
// ============================================================================

export interface ScrapedPage {
  path: string;
  sourceUrl: string;
  title: string;
  description?: string;
  wordCount?: number;
}

export interface ScrapeMetadata {
  domain: string;
  sourceUrl: string;
  scrapedAt: string;
  pageCount: number;
  totalWordCount?: number;
  pages: ScrapedPage[];
  tags?: string[];
  version: number;
  scrapeOptions?: Partial<ScrapeOptions>;
}

export interface ScrapeResult {
  domain: string;
  pageCount: number;
  localPath: string;
  githubUrl: string;
  totalWordCount?: number;
  duration?: number;
}

// ============================================================================
// Index Types
// ============================================================================

export interface SiteIndexEntry {
  scrapedAt: string;
  pageCount: number;
  sourceUrl: string;
  tags?: string[];
  version: number;
  totalWordCount?: number;
}

export interface DocsIndex {
  version: number;
  lastUpdated: string;
  sites: Record<string, SiteIndexEntry>;
}

// ============================================================================
// Search Types
// ============================================================================

export interface SearchResult {
  domain: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
  sourceUrl: string;
}

export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Filter by domain */
  domain?: string;
  /** Filter by tags */
  tags?: string[];
  /** Case-sensitive search */
  caseSensitive?: boolean;
}

// ============================================================================
// Crawl Status
// ============================================================================

export interface CrawlStatus {
  status: "pending" | "crawling" | "completed" | "failed" | "cancelled";
  completed: number;
  total: number;
  currentUrl?: string;
  error?: string;
}

export interface CrawlStatusResponse {
  status: string;
  completed?: number;
  total?: number;
  data?: PageData[];
  error?: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class ScraperError extends Error {
  constructor(
    message: string,
    public readonly code: ScraperErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ScraperError";
  }
}

export type ScraperErrorCode =
  | "CRAWL_FAILED"
  | "CRAWL_TIMEOUT"
  | "RATE_LIMITED"
  | "INVALID_URL"
  | "DOMAIN_NOT_FOUND"
  | "DOC_NOT_FOUND"
  | "GITHUB_ERROR"
  | "FILESYSTEM_ERROR"
  | "INVALID_OPTIONS";
