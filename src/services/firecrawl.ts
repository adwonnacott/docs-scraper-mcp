/**
 * Firecrawl API client for crawling documentation sites
 */

interface Action {
  type: "wait" | "click" | "scroll" | "screenshot" | "executeJavascript";
  milliseconds?: number;
  selector?: string;
  direction?: "up" | "down";
  script?: string;
}

interface CrawlOptions {
  limit?: number;
  waitFor?: number;
  actions?: Action[];
}

interface PageData {
  markdown?: string;
  metadata?: {
    sourceURL?: string;
    title?: string;
  };
}

interface CrawlStatusResponse {
  status: string;
  completed?: number;
  total?: number;
  data?: PageData[];
}

export class FirecrawlService {
  private apiKey: string;
  private baseUrl = "https://api.firecrawl.dev/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async crawl(url: string, options: CrawlOptions = {}): Promise<PageData[]> {
    const limit = options.limit ?? 100;
    const waitFor = options.waitFor ?? 0;
    const actions = options.actions ?? [];

    // Build scrapeOptions
    const scrapeOptions: Record<string, unknown> = {
      formats: ["markdown"],
      onlyMainContent: true,
    };

    // Add waitFor if specified
    if (waitFor > 0) {
      scrapeOptions.waitFor = waitFor;
    }

    // Add actions if specified
    if (actions.length > 0) {
      scrapeOptions.actions = actions;
    }

    // Start crawl job
    const startResponse = await fetch(`${this.baseUrl}/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        url,
        limit,
        scrapeOptions,
      }),
    });

    if (!startResponse.ok) {
      const error = await startResponse.text();
      throw new Error(`Failed to start crawl: ${error}`);
    }

    const startData = await startResponse.json();
    const jobId = startData.id;

    if (!jobId) {
      throw new Error("No job ID returned from crawl request");
    }

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max (5s intervals)

    while (attempts < maxAttempts) {
      await this.sleep(5000);

      const statusResponse = await fetch(`${this.baseUrl}/crawl/${jobId}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to get crawl status: ${statusResponse.statusText}`);
      }

      const statusData: CrawlStatusResponse = await statusResponse.json();

      if (statusData.status === "completed") {
        return statusData.data ?? [];
      }

      if (statusData.status === "failed") {
        throw new Error("Crawl job failed");
      }

      // Log progress
      const completed = statusData.completed ?? 0;
      const total = statusData.total ?? "?";
      console.error(`Crawling... ${completed}/${total} pages`);

      attempts++;
    }

    throw new Error("Crawl timed out after 10 minutes");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
