# docs-scraper-mcp

An MCP server for scraping documentation with Firecrawl and storing in GitHub.

## Features

- **scrape_docs** - Scrape any documentation URL, save locally and push to GitHub
- **list_docs** - List all scraped documentation sources
- **get_doc** - Retrieve content from scraped documentation

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

## Usage

In Claude Code:

- "Scrape the docs at https://developer.timecamp.com/"
- "What docs do I have scraped?"
- "Show me the TimeCamp authentication docs"

## Local storage

Scraped docs are saved to `~/scraped-docs/` organized by domain.
