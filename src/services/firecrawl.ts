/**
 * Firecrawl API client for crawling documentation sites
 * Enhanced with retry logic, better error handling, and comprehensive options
 */

import type { Action, PageData, CrawlStatusResponse, CrawlStatus, ScraperErrorCode } from "../types.js";
import { ScraperError } from "../types.js";

export interface CrawlOptions {
  /** Maximum number of pages to scrape */
  limit?: number;
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
  /** Whether to ignore the sitemap */
  ignoreSitemap?: boolean;
  /** Whether to allow backward links */
  allowBackwardLinks?: boolean;
  /** Whether to allow external links */
  allowExternalLinks?: boolean;
  /** Custom headers to send with requests */
  headers?: Record<string, string>;
  /** Progress callback */
  onProgress?: (status: CrawlStatus) => void;
}

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

export class FirecrawlService {
  private apiKey: string;
  private baseUrl = "https://api.firecrawl.dev/v1";
  private retryOptions: RetryOptions;

  constructor(apiKey: string, retryOptions?: Partial<RetryOptions>) {
    this.apiKey = apiKey;
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  }

  /**
   * Crawl a website and return the scraped pages
   */
  async crawl(url: string, options: CrawlOptions = {}): Promise<PageData[]> {
    const {
      limit = 100,
      waitFor = 0,
      actions = [],
      includePaths,
      excludePaths,
      maxDepth,
      ignoreSitemap,
      allowBackwardLinks,
      allowExternalLinks,
      headers,
      onProgress,
    } = options;

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new ScraperError(`Invalid URL: ${url}`, "INVALID_URL");
    }

    // Build scrapeOptions
    const scrapeOptions: Record<string, unknown> = {
      formats: ["markdown"],
      onlyMainContent: true,
    };

    if (waitFor > 0) {
      scrapeOptions.waitFor = waitFor;
    }

    if (actions.length > 0) {
      scrapeOptions.actions = actions;
    }

    if (headers && Object.keys(headers).length > 0) {
      scrapeOptions.headers = headers;
    }

    // Build crawl request body
    const crawlBody: Record<string, unknown> = {
      url,
      limit,
      scrapeOptions,
    };

    if (includePaths && includePaths.length > 0) {
      crawlBody.includePaths = includePaths;
    }

    if (excludePaths && excludePaths.length > 0) {
      crawlBody.excludePaths = excludePaths;
    }

    if (maxDepth !== undefined) {
      crawlBody.maxDepth = maxDepth;
    }

    if (ignoreSitemap !== undefined) {
      crawlBody.ignoreSitemap = ignoreSitemap;
    }

    if (allowBackwardLinks !== undefined) {
      crawlBody.allowBackwardLinks = allowBackwardLinks;
    }

    if (allowExternalLinks !== undefined) {
      crawlBody.allowExternalLinks = allowExternalLinks;
    }

    // Start crawl job with retry
    const startData = await this.retryRequest(
      async () => {
        const response = await fetch(`${this.baseUrl}/crawl`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(crawlBody),
        });

        if (!response.ok) {
          const error = await response.text();
          const errorObj = this.parseErrorResponse(error, response.status);
          throw errorObj;
        }

        return response.json();
      },
      "starting crawl"
    );

    const jobId = startData.id;
    if (!jobId) {
      throw new ScraperError("No job ID returned from crawl request", "CRAWL_FAILED");
    }

    // Poll for completion
    return this.pollForCompletion(jobId, onProgress);
  }

  /**
   * Scrape a single page (useful for targeted scraping)
   */
  async scrapeSingle(url: string, options: Omit<CrawlOptions, "limit"> = {}): Promise<PageData> {
    const { waitFor = 0, actions = [], headers } = options;

    // Build scrapeOptions
    const scrapeOptions: Record<string, unknown> = {
      formats: ["markdown"],
      onlyMainContent: true,
    };

    if (waitFor > 0) {
      scrapeOptions.waitFor = waitFor;
    }

    if (actions.length > 0) {
      scrapeOptions.actions = actions;
    }

    if (headers && Object.keys(headers).length > 0) {
      scrapeOptions.headers = headers;
    }

    const response = await this.retryRequest(
      async () => {
        const res = await fetch(`${this.baseUrl}/scrape`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            url,
            ...scrapeOptions,
          }),
        });

        if (!res.ok) {
          const error = await res.text();
          throw this.parseErrorResponse(error, res.status);
        }

        return res.json();
      },
      "scraping page"
    );

    return {
      markdown: response.data?.markdown,
      metadata: response.data?.metadata,
    };
  }

  /**
   * Cancel an ongoing crawl job
   */
  async cancelCrawl(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/crawl/${jobId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
  }

  /**
   * Poll for crawl completion
   */
  private async pollForCompletion(
    jobId: string,
    onProgress?: (status: CrawlStatus) => void
  ): Promise<PageData[]> {
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (5s intervals)

    while (attempts < maxAttempts) {
      await this.sleep(5000);

      const statusData = await this.retryRequest(
        async () => {
          const response = await fetch(`${this.baseUrl}/crawl/${jobId}`, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
          });

          if (!response.ok) {
            throw new ScraperError(
              `Failed to get crawl status: ${response.statusText}`,
              "CRAWL_FAILED"
            );
          }

          return response.json() as Promise<CrawlStatusResponse>;
        },
        "checking crawl status"
      );

      // Map status to our CrawlStatus type
      const status: CrawlStatus = {
        status: this.mapCrawlStatus(statusData.status),
        completed: statusData.completed ?? 0,
        total: statusData.total ?? 0,
      };

      // Call progress callback if provided
      if (onProgress) {
        onProgress(status);
      }

      // Log progress
      console.error(`Crawling... ${status.completed}/${status.total} pages (${statusData.status})`);

      if (statusData.status === "completed") {
        return statusData.data ?? [];
      }

      if (statusData.status === "failed") {
        throw new ScraperError(
          statusData.error ?? "Crawl job failed",
          "CRAWL_FAILED",
          { jobId }
        );
      }

      if (statusData.status === "cancelled") {
        throw new ScraperError("Crawl job was cancelled", "CRAWL_FAILED", { jobId });
      }

      attempts++;
    }

    throw new ScraperError("Crawl timed out after 10 minutes", "CRAWL_TIMEOUT", { jobId });
  }

  /**
   * Map Firecrawl status to our CrawlStatus type
   */
  private mapCrawlStatus(status: string): CrawlStatus["status"] {
    switch (status) {
      case "completed":
        return "completed";
      case "failed":
        return "failed";
      case "cancelled":
        return "cancelled";
      case "scraping":
      case "crawling":
        return "crawling";
      default:
        return "pending";
    }
  }

  /**
   * Parse error response and return appropriate ScraperError
   */
  private parseErrorResponse(error: string, status: number): ScraperError {
    let errorCode: ScraperErrorCode = "CRAWL_FAILED";
    let message = error;

    // Try to parse JSON error
    try {
      const parsed = JSON.parse(error);
      message = parsed.error ?? parsed.message ?? error;
    } catch {
      // Use raw error string
    }

    // Map HTTP status to error codes
    if (status === 429) {
      errorCode = "RATE_LIMITED";
      message = "Rate limited by Firecrawl API. Please wait and try again.";
    } else if (status === 401 || status === 403) {
      message = "Invalid or expired Firecrawl API key";
    } else if (status === 400) {
      errorCode = "INVALID_OPTIONS";
    }

    return new ScraperError(message, errorCode, { status });
  }

  /**
   * Retry a request with exponential backoff
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    operation: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retryOptions.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (error instanceof ScraperError) {
          if (
            error.code === "INVALID_URL" ||
            error.code === "INVALID_OPTIONS" ||
            error.code === "RATE_LIMITED"
          ) {
            throw error;
          }
        }

        // Calculate delay with exponential backoff and jitter
        const delay = Math.min(
          this.retryOptions.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
          this.retryOptions.maxDelayMs
        );

        console.error(
          `Retry ${attempt + 1}/${this.retryOptions.maxRetries} for ${operation} after ${Math.round(delay)}ms`
        );

        await this.sleep(delay);
      }
    }

    throw lastError ?? new ScraperError(`Failed after ${this.retryOptions.maxRetries} retries`, "CRAWL_FAILED");
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
