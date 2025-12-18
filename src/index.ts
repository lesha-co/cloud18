import RedditCrawler from "./crawler.ts";
import Database from "./database.ts";

import assert from "node:assert";
import { sleep } from "./sleep.ts";

assert(process.env.DATABASE_FILE);
assert(process.env.DELAY);
assert(process.env.USERNAME);
assert(process.env.PASSWORD);

const delay = parseInt(process.env.DELAY);
assert(!isNaN(delay));

const db = new Database(process.env.DATABASE_FILE);
const crawler = new RedditCrawler(
  delay,
  process.env.USERNAME,
  process.env.PASSWORD,
  process.env.HEADLESS === "true",
);
await crawler.init();

// Process subreddits using the generator
let count = 0;
for await (const subreddit of db.getUnvisitedGenerator()) {
  await sleep(delay);

  console.log(`${count + 1}/${await db.getUnvisitedCount()}: r/${subreddit}`);

  const sub = await crawler.crawlSubreddit(subreddit);

  if (sub.meta !== null) {
    await db.updateSubscribers(subreddit, sub.meta.subscribers);
    await db.updateNSFW(subreddit, sub.meta.over18);
  }

  for (const discovered of sub.links) {
    await db.addToQueue(discovered);
    await db.addEdge(subreddit, discovered);
  }
  console.log(`Created ${sub.links.length} edges from r/${subreddit}`);

  // Display some of the discovered subreddits
  if (sub.links.length > 0) {
    console.log("Discovered subreddits:");
    sub.links.forEach((sub) => console.log(`- r/${sub}`));
  }
  await db.markVisited(subreddit);
  count++;
}

// Report final stats
const remainingCount = await db.getUnvisitedCount();
console.log(`\nCrawling completed.`);
console.log(`Processed ${count} subreddits.`);
console.log(`${remainingCount} subreddits remaining in queue.`);

// Cleanup
await crawler.close();
db.close();
