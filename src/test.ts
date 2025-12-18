// /r/ActualYuri.
import RedditCrawler from "./crawler.ts";
import Database from "./database.ts";

import assert from "node:assert";

assert(process.env.DATABASE_FILE);
assert(process.env.DELAY);
assert(process.env.USERNAME);
assert(process.env.PASSWORD);

const delay = parseInt(process.env.DELAY);
assert(!isNaN(delay));

const crawler = new RedditCrawler(
  delay,
  process.env.USERNAME,
  process.env.PASSWORD,
  process.env.HEADLESS === "true",
);
await crawler.init();

const sub = await crawler.crawlSubreddit("apple");
console.log(sub.links);
assert(sub.links.length >= 17);
