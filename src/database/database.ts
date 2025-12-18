import sqlite3 from "sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import assert from "node:assert";
import z from "zod";
import { SubredditRow } from "../analysis/common-types.ts";

const sqlite = sqlite3.verbose();

class Database {
  private db: sqlite3.Database | null;

  constructor() {
    this.db = null;
    // Ensure directory exists
  }
  async open(dbPath: string, readonly: boolean) {
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    return new Promise<void>((resolve, reject) => {
      const callback = (err: Error | null) => {
        if (err) {
          console.error(`Error opening database: ${err.message}`);
          reject(err);
        } else {
          this.initDatabase();
          resolve();
        }
      };
      if (readonly) {
        this.db = new sqlite.Database(dbPath, sqlite.OPEN_READONLY, callback);
      } else {
        this.db = new sqlite.Database(dbPath, callback);
      }
    });
  }

  private initDatabase(): void {
    let db = this.db;
    assert(db);
    // Run initialization in a transaction
    db.serialize(() => {
      // Enable foreign keys
      db.run("PRAGMA foreign_keys = ON");

      db.run(`
        CREATE TABLE IF NOT EXISTS subreddit_edges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_id INTEGER NOT NULL,
          to_id INTEGER NOT NULL,
          discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_id) REFERENCES subreddit_queue(id) ON DELETE CASCADE,
          FOREIGN KEY (to_id) REFERENCES subreddit_queue(id) ON DELETE CASCADE,
          UNIQUE(from_id, to_id)
        );
      `);
      // Create queue table with auto-increment ID
      db.run(`
        CREATE TABLE IF NOT EXISTS subreddit_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subreddit TEXT UNIQUE NOT NULL,
          visited BOOLEAN DEFAULT FALSE,
          subscribers INTEGER DEFAULT NULL,
          nsfw BOOLEAN DEFAULT NULL,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create multis table
      db.run(`
        CREATE TABLE IF NOT EXISTS multis (
          multi_name TEXT NOT NULL,
          subreddit_name TEXT NOT NULL,
          added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (multi_name, subreddit_name)
        );
      `);

      // Create indexes for better performance
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_edges_from ON subreddit_edges(from_id);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_edges_to ON subreddit_edges(to_id);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_queue_visited ON subreddit_queue(visited);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_queue_subreddit ON subreddit_queue(subreddit);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_multis_name ON multis(multi_name);
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_multis_subreddit ON multis(subreddit_name);
      `);
    });
  }

  /**
   * Add a subreddit to the processing queue if it doesn't already exist
   * @param subreddit - The subreddit name (without r/ prefix)
   * @returns Promise resolving to the subreddit ID
   */
  async addToQueue(subreddit: string): Promise<number> {
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, "");

    await this.query(
      "INSERT OR IGNORE INTO subreddit_queue (subreddit, visited) VALUES (?, FALSE)",
      [normalizedSubreddit],
    );
    const row = await this.query(
      "SELECT id FROM subreddit_queue WHERE subreddit = ?",
      [normalizedSubreddit],
    );

    return row.id;
  }

  async getSubredditId(sub: string): Promise<number> {
    const row = await this.query(
      "SELECT id FROM subreddit_queue WHERE subreddit = ?",
      [sub.toLowerCase().replace(/^r\//, "")],
    );
    assert(row.id);
    assert(typeof row.id === "number");
    return row.id;
  }
  async addEdge(from: string, to: string) {
    const fromId = await this.getSubredditId(from);
    const toId = await this.getSubredditId(to);
    await this.addEdgeById(fromId, toId);
  }

  async addEdgeById(fromId: number, toId: number): Promise<void> {
    if (!fromId || !toId || fromId === toId) return;

    const db = this.db;
    assert(db);
    await new Promise<void>((resolve, reject) => {
      db.run(
        "INSERT OR IGNORE INTO subreddit_edges (from_id, to_id) VALUES (?, ?)",
        [fromId, toId],
        (err) => {
          if (err) {
            console.error(`Error adding edge by ID: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  /**
   * Update the NSFW status for a subreddit
   * @param subreddit - The subreddit name
   * @param nsfw - Whether the subreddit is NSFW
   */
  async updateMeta(
    subreddit: string,
    nsfw: boolean,
    subscribers: number,
  ): Promise<void> {
    if (!subreddit) return;
    const normalizedSubreddit = subreddit.toLowerCase().replace(/^r\//, "");
    const db = this.db;
    assert(db);
    await new Promise<void>((resolve, reject) => {
      db.run(
        "UPDATE subreddit_queue SET nsfw = ?, subscribers = ? WHERE subreddit = ?",
        [nsfw, subscribers, normalizedSubreddit],
        (err) => {
          if (err) {
            console.error(`Error updating NSFW status: ${err.message}`);
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
    const db = this.db;
    assert(db);
    await new Promise<void>((resolve, reject) => {
      db.run(
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
  private async getNextUnvisited(): Promise<string | null> {
    const db = this.db;
    assert(db);
    return new Promise((resolve, reject) => {
      db.get(
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
   * Add multiple subreddits to the queue in a single transaction
   * @param subreddits - Array of subreddit names
   * @returns Promise resolving to array of IDs
   */
  async addMultipleToQueue(subreddits: string[]): Promise<number[]> {
    if (!subreddits || !subreddits.length) return [];
    const db = this.db;
    assert(db);

    return new Promise<number[]>((resolve, reject) => {
      db.serialize(() => {
        const stmt = db.prepare(
          "INSERT OR IGNORE INTO subreddit_queue (subreddit, visited) VALUES (?, FALSE)",
        );

        const promises: Promise<number>[] = [];

        for (const subreddit of subreddits) {
          if (subreddit) {
            const normalizedSubreddit = subreddit
              .toLowerCase()
              .replace(/^r\//, "");

            promises.push(
              new Promise<number>((resolveId, rejectId) => {
                stmt.run(normalizedSubreddit, (err) => {
                  if (err) {
                    console.error(`Error in batch queue add: ${err.message}`);
                    rejectId(err);
                  } else {
                    // Get the ID after insertion
                    db.get(
                      "SELECT id FROM subreddit_queue WHERE subreddit = ?",
                      [normalizedSubreddit],
                      (err, row: any) => {
                        if (err) {
                          rejectId(err);
                        } else if (row) {
                          resolveId(row.id);
                        } else {
                          rejectId(
                            new Error(
                              `Failed to get ID for ${normalizedSubreddit}`,
                            ),
                          );
                        }
                      },
                    );
                  }
                });
              }),
            );
          }
        }

        stmt.finalize(async (err) => {
          if (err) {
            reject(err);
          } else {
            try {
              const resolvedIds = await Promise.all(promises);
              resolve(resolvedIds);
            } catch (error) {
              reject(error);
            }
          }
        });
      });
    });
  }

  /**
   * Get count of unvisited subreddits in the queue
   * @returns Promise resolving to the number of unvisited subreddits
   */
  async getUnvisitedCount(): Promise<number> {
    const db = this.db;
    assert(db);
    return new Promise((resolve, reject) => {
      db.get(
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
    }
  }

  /**
   * Add a subreddit to a multireddit collection
   * @param multiName - Name of the multireddit
   * @param subredditName - Name of the subreddit to add to the multi
   */
  async setMulti(multiName: string, subredditName: string): Promise<void> {
    if (!multiName || !subredditName) return;

    const normalizedSubreddit = subredditName.toLowerCase().replace(/^r\//, "");
    const normalizedMulti = multiName.toLowerCase();
    const db = this.db;
    assert(db);
    return new Promise<void>((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO multis (multi_name, subreddit_name) VALUES (?, ?)",
        [normalizedMulti, normalizedSubreddit],
        (err) => {
          if (err) {
            console.error(`Error adding to multis: ${err.message}`);
            reject(err);
          } else {
            resolve();
          }
        },
      );
    });
  }

  async getAllEdgesIDs() {
    const EdgesArraySchema = z.array(
      z.object({
        from_id: z.number(),
        to_id: z.number(),
      }),
    );

    const result = await this.all(`SELECT from_id, to_id FROM subreddit_edges`);

    return EdgesArraySchema.parse(result);
  }

  async getAllEdges() {
    const EdgesArraySchema = z.array(
      z.object({
        from_subreddit: z.string(),
        to_subreddit: z.string(),
      }),
    );

    const result = await this.all(`SELECT
      q1.subreddit as from_subreddit,
      q2.subreddit as to_subreddit
    FROM subreddit_edges e
    INNER JOIN subreddit_queue q1 ON e.from_id = q1.id
    INNER JOIN subreddit_queue q2 ON e.to_id = q2.id`);

    return EdgesArraySchema.parse(result);
  }

  async subreddits() {
    const rows = z
      .array(SubredditRow)
      .parse(
        await this.all(
          "SELECT id, subreddit, subscribers, nsfw FROM subreddit_queue",
        ),
      );
    return rows;
  }

  async query(sql: string, params?: any[]): Promise<any> {
    const db = this.db;
    assert(db);
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err: Error | null, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }
  async all(query: string) {
    const db = this.db;
    assert(db);
    return new Promise((resolve, reject) => {
      db.all(query, (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }
  /**
   * Close the database connection
   */
  async close() {
    const db = this.db;
    assert(db);
    return new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) {
          console.error(`Error closing database: ${err.message}`);
          reject(err);
        } else {
          this.db = null;
          resolve();
        }
      });
    });
  }
}

export default Database;
