/**
 * crawl subreddits in queue
 */
import RedditCrawler from "./crawler.ts";
import { processList } from "./processList.ts";
import Database from "../database/database.ts";

import assert from "node:assert";

assert(process.env.DATABASE_FILE);
assert(process.env.DELAY);
assert(process.env.USERNAME);
assert(process.env.PASSWORD);

const delay = parseInt(process.env.DELAY);
assert(!isNaN(delay));

const db = new Database();
await db.open(process.env.DATABASE_FILE, false);
const crawler = new RedditCrawler(
  delay,
  process.env.USERNAME,
  process.env.PASSWORD,
  process.env.HEADLESS === "true",
);
await crawler.init();

// Process subreddits using the generator

await processList(
  db.getUnvisitedGenerator(),
  crawler,
  delay,
  db.getUnvisitedCount,
  db,
);

// Report final stats
console.log(`\nCrawling completed.`);
const remainingCount = await db.getUnvisitedCount();
console.log(`${remainingCount} subreddits remaining in queue.`);

// Cleanup
await crawler.close();
db.close();
