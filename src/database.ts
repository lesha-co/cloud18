import sqlite3 from "sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const sqlite = sqlite3.verbose();

class Database {
  private db: sqlite3.Database;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite.Database(dbPath, (err) => {
      if (err) {
        console.error(`Error opening database: ${err.message}`);
        throw err;
      }
    });
    this.initDatabase();
  }

  private initDatabase(): void {
    // Run initialization in a transaction
    this.db.serialize(() => {
      // Enable foreign keys
      this.db.run("PRAGMA foreign_keys = ON");

      // Create edges table for subreddit connections
      this.db.run(`
        CREATE TABLE IF NOT EXISTS subreddit_edges (
          from_subreddit TEXT NOT NULL,
          to_subreddit TEXT NOT NULL,
          discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (from_subreddit, to_subreddit)
        );
      `);

      // Create queue table for processing
      this.db.run(`
        CREATE TABLE IF NOT EXISTS subreddit_queue (
          subreddit TEXT PRIMARY KEY,
          visited BOOLEAN DEFAULT FALSE,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create indexes for better performance
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_edges_from ON subreddit_edges(from_subreddit);
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_edges_to ON subreddit_edges(to_subreddit);
      `);
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_queue_visited ON subreddit_queue(visited);
      `);
    });
  }

  /**
   * Add a subreddit to the processing queue if it doesn't already exist
   * @param subreddit - The subreddit name (without r/ prefix)
   */
  async addToQueue(subreddit: string): Promise<void> {
    if (!subreddit) return;
    // Normalize subreddit name (lowercase, remove r/ prefix if present)
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, "");

    await new Promise<void>((resolve, reject) => {
      this.db.run(
        "INSERT OR IGNORE INTO subreddit_queue (subreddit, visited) VALUES (?, FALSE)",
        [normalizedSubreddit],
        (err) => {
          if (err) {
            console.error(`Error adding to queue: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  /**
   * Add an edge between two subreddits
   * @param fromSubreddit - Source subreddit
   * @param toSubreddit - Target subreddit
   */
  async addEdge(fromSubreddit: string, toSubreddit: string): Promise<void> {
    if (!fromSubreddit || !toSubreddit || fromSubreddit === toSubreddit) return;

    // Normalize subreddit names
    const normalizedFrom = fromSubreddit.toLowerCase().replace(/^r\//, "");
    const normalizedTo = toSubreddit.toLowerCase().replace(/^r\//, "");

    await new Promise<void>((resolve, reject) => {
      this.db.run(
        "INSERT OR IGNORE INTO subreddit_edges (from_subreddit, to_subreddit) VALUES (?, ?)",
        [normalizedFrom, normalizedTo],
        (err) => {
          if (err) {
            console.error(`Error adding edge: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  /**
   * Mark a subreddit as visited
   * @param subreddit - The subreddit name
   */
  async markVisited(subreddit: string): Promise<void> {
    if (!subreddit) return;
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, "");

    await new Promise<void>((resolve, reject) => {
      this.db.run(
        "UPDATE subreddit_queue SET visited = TRUE WHERE subreddit = ?",
        [normalizedSubreddit],
        (err) => {
          if (err) {
            console.error(`Error marking as visited: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  /**
   * Get the next unvisited subreddit from the queue
   * @returns Promise resolving to the next subreddit to process or null if queue is empty
   */
  async getNextUnvisited(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT subreddit FROM subreddit_queue WHERE visited = FALSE ORDER BY added_at LIMIT 1",
        (err, row: any) => {
          if (err) {
            console.error(`Error getting next unvisited: ${err.message}`);
            reject(err);
          } else {
            resolve(row ? row.subreddit : null);
          }
        },
      );
    });
  }

  /**
   * Check if a subreddit has already been visited
   * @param subreddit - The subreddit name
   * @returns Promise resolving to true if already visited, false otherwise
   */
  async isVisited(subreddit: string): Promise<boolean> {
    if (!subreddit) return false;
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, "");

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT visited FROM subreddit_queue WHERE subreddit = ?",
        [normalizedSubreddit],
        (err, row: any) => {
          if (err) {
            console.error(`Error checking if visited: ${err.message}`);
            reject(err);
          } else {
            resolve(row ? Boolean(row.visited) : false);
          }
        },
      );
    });
  }

  /**
   * Add multiple subreddits to the queue in a single transaction
   * @param subreddits - Array of subreddit names
   */
  async addMultipleToQueue(subreddits: string[]): Promise<void> {
    if (!subreddits || !subreddits.length) return;

    return new Promise<void>((resolve, reject) => {
      this.db.serialize(() => {
        const stmt = this.db.prepare(
          "INSERT OR IGNORE INTO subreddit_queue (subreddit, visited) VALUES (?, FALSE)",
        );

        for (const subreddit of subreddits) {
          if (subreddit) {
            const normalizedSubreddit = subreddit
              .toLowerCase()
              .replace(/^r\//, "");
            stmt.run(normalizedSubreddit, (err) => {
              if (err) {
                console.error(`Error in batch queue add: ${err.message}`);
              }
            });
          }
        }

        stmt.finalize((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  /**
   * Get count of unvisited subreddits in the queue
   * @returns Promise resolving to the number of unvisited subreddits
   */
  async getUnvisitedCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT COUNT(*) as count FROM subreddit_queue WHERE visited = FALSE",
        (err, row: any) => {
          if (err) {
            console.error(`Error getting unvisited count: ${err.message}`);
            reject(err);
          } else {
            resolve(row ? row.count : 0);
          }
        },
      );
    });
  }

  /**
   * Async generator function that yields unvisited subreddits one at a time
   * @yields Next unvisited subreddit from the queue
   */
  async *getUnvisitedGenerator(): AsyncGenerator<string> {
    while (true) {
      const subreddit = await this.getNextUnvisited();
      if (!subreddit) {
        break;
      }
      yield subreddit;
      await this.markVisited(subreddit);
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error(`Error closing database: ${err.message}`);
        }
      });
    }
  }
}

export default Database;
