/**
 * find entries with missing data and re-request them
 */
import assert from "node:assert";
import Database from "../database/database.ts";
import RedditCrawler from "./crawler.ts";
import { processList } from "./processList.ts";

const sleep = (d: number) => new Promise((r) => setTimeout(r, d));

assert(process.env.DATABASE_FILE);
assert(process.env.DELAY);
assert(process.env.USERNAME);
assert(process.env.PASSWORD);
const delay = parseInt(process.env.DELAY);
assert(!isNaN(delay));

const db = new Database();
await db.open(process.env.DATABASE_FILE, false);

const rows = (await db.all(
  "select subreddit from subreddit_queue where nsfw is null or subscribers is null",
)) as { subreddit: string }[];

const crawler = new RedditCrawler(
  delay,
  process.env.USERNAME,
  process.env.PASSWORD,
  process.env.HEADLESS === "true",
);
await crawler.init();

await processList(
  rows.map((x) => x.subreddit),
  crawler,
  delay,
  undefined,
  db,
);
