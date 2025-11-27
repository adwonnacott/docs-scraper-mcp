# docs-scraper-mcp

A production-quality MCP server for scraping documentation with Firecrawl and storing in GitHub.

## Features

### Scraping
- **scrape_docs** - Scrape any documentation URL with URL pattern filtering
- **scrape_spa** - Scrape JavaScript-heavy sites (React, Vue, Angular, Stoplight) with wait times and actions

### Retrieval
- **list_docs** - List all scraped documentation sources with stats
- **get_doc** - Retrieve content from scraped documentation
- **search_docs** - Full-text search across all scraped docs with ranked results
- **docs_stats** - Get statistics about your documentation library

### Management
- **delete_docs** - Delete docs for a specific domain
- **delete_all_docs** - Delete all scraped documentation

### Additional Features
- **Tagging** - Categorize docs with tags for easy filtering
- **Version tracking** - Track scrape versions for each domain
- **Word count** - Automatic word counting for all scraped pages
- **URL filtering** - Include/exclude patterns for targeted scraping
- **Retry logic** - Automatic retries with exponential backoff
- **GitHub backup** - All docs backed up to GitHub automatically

## Setup

### 1. Clone and build

```bash
git clone https://github.com/adwonnacott/docs-scraper-mcp.git ~/docs-scraper-mcp
cd ~/docs-scraper-mcp
npm install
npm run build
```

### 2. Get your tokens

- **Firecrawl API key**: Sign up at https://firecrawl.dev
- **GitHub token**: Run `gh auth login` then `gh auth token`, or create a PAT at https://github.com/settings/tokens

### 3. Create a GitHub repo for storing docs

```bash
gh repo create scraped-docs --public
# IMPORTANT: Add a README to initialize the repo
echo "# Scraped Documentation" > /tmp/README.md
gh repo clone yourusername/scraped-docs /tmp/scraped-docs
cp /tmp/README.md /tmp/scraped-docs/
cd /tmp/scraped-docs && git add . && git commit -m "Initial commit" && git push
```

### 4. Configure Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "docs-scraper": {
      "command": "node",
      "args": ["~/docs-scraper-mcp/dist/index.js"],
      "env": {
        "FIRECRAWL_API_KEY": "your-firecrawl-key",
        "GITHUB_TOKEN": "your-github-token",
        "GITHUB_REPO": "yourusername/scraped-docs"
      }
    }
  }
}
```

### 5. Restart Claude Code

The tools will be available after restart.

## Usage Examples

### Basic scraping
```
"Scrape the docs at https://docs.stripe.com/api"
```

### Scraping with filters
```
"Scrape https://docs.example.com but only include /api/* paths and exclude /blog/*"
```

### Scraping SPAs
```
"Use scrape_spa on https://developer.timecamp.com/ with 10 second wait time"
```

### Searching
```
"Search my docs for 'authentication'"
"Search for 'webhook' in the stripe docs only"
```

### Tagging
```
"Scrape https://docs.example.com with tags ['api', 'payments']"
```

### Getting stats
```
"Show me my docs stats"
```

## Local Storage

Scraped docs are saved to `~/scraped-docs/` organized by domain:

```
~/scraped-docs/
├── index.json                    # Master index
├── docs-stripe-com/
│   ├── _metadata.json           # Domain metadata
│   ├── index.md
│   ├── api_authentication.md
│   └── ...
└── developer-timecamp-com/
    ├── _metadata.json
    └── ...
```

## Architecture

```
src/
├── index.ts           # MCP server entry point, tool registration
├── types.ts           # Shared TypeScript types
├── services/
│   ├── firecrawl.ts   # Firecrawl API client with retry logic
│   └── github.ts      # GitHub API client for backup
└── tools/
    ├── scrape.ts      # Scraping logic
    ├── list.ts        # List docs
    ├── get.ts         # Get doc content
    ├── search.ts      # Full-text search
    └── delete.ts      # Delete docs
```

## Troubleshooting

### "Git Repository is empty" error
Initialize your GitHub repo with at least one commit (a README).

### Only 2 pages scraped from SPA
Some sites like Stoplight load content via JavaScript. Use `scrape_spa` with a higher `waitFor` value. Note: if the site is a true single-page app with no real URLs, you may only get 1-2 pages regardless.

### Rate limited
The Firecrawl free tier has limits. Upgrade or wait for the limit to reset.

## License

MIT
