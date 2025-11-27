/**
 * GitHub service for committing scraped documentation
 */

import { Octokit } from "octokit";

interface FileToCommit {
  path: string;
  content: string;
}

export class GitHubService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, repoFullName: string) {
    this.octokit = new Octokit({ auth: token });
    const [owner, repo] = repoFullName.split("/");
    this.owner = owner;
    this.repo = repo;
  }

  async commitFiles(files: FileToCommit[], message: string): Promise<string> {
    // Get the default branch
    const { data: repoData } = await this.octokit.rest.repos.get({
      owner: this.owner,
      repo: this.repo,
    });
    const defaultBranch = repoData.default_branch || "main";

    // Try to get the latest commit SHA, or handle empty repo
    let baseTreeSha: string | null = null;
    let parentSha: string | null = null;

    try {
      const { data: refData } = await this.octokit.rest.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${defaultBranch}`,
      });
      parentSha = refData.object.sha;

      const { data: commitData } = await this.octokit.rest.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: parentSha,
      });
      baseTreeSha = commitData.tree.sha;
    } catch (error: unknown) {
      // Repository is empty or branch doesn't exist, we'll create the first commit
      const err = error as { status?: number; message?: string };
      const isEmptyRepoError =
        err.status === 404 ||
        err.status === 409 ||
        (typeof err.message === "string" && err.message.includes("empty"));
      if (!isEmptyRepoError) {
        throw error;
      }
      // For empty repos, parentSha and baseTreeSha remain null
    }

    // Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await this.octokit.rest.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: Buffer.from(file.content).toString("base64"),
          encoding: "base64",
        });

        return {
          path: file.path,
          mode: "100644" as const,
          type: "blob" as const,
          sha: blob.sha,
        };
      })
    );

    // Create tree
    const { data: tree } = await this.octokit.rest.git.createTree({
      owner: this.owner,
      repo: this.repo,
      tree: treeItems,
      base_tree: baseTreeSha ?? undefined,
    });

    // Create commit
    const { data: commit } = await this.octokit.rest.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : [],
    });

    // Update or create ref
    if (parentSha) {
      await this.octokit.rest.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${defaultBranch}`,
        sha: commit.sha,
      });
    } else {
      await this.octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${defaultBranch}`,
        sha: commit.sha,
      });
    }

    return commit.sha;
  }

  async getFileContent(path: string): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
      });

      if ("content" in data && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }
      return null;
    } catch {
      return null;
    }
  }
}
