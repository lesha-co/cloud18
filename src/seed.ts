import RedditCrawler from "./crawler.ts";
import Database from "./database.ts";
import assert from "node:assert";

assert(process.env.DATABASE_FILE);
assert(process.env.DELAY);
assert(process.env.USERNAME);
assert(process.env.PASSWORD);

const delay = parseInt(process.env.DELAY);
assert(!isNaN(delay));

const username = process.env.USERNAME;
const db = new Database(process.env.DATABASE_FILE);
const crawler = new RedditCrawler(
  delay,
  process.env.USERNAME,
  process.env.PASSWORD,
  process.env.HEADLESS === "true",
);
await crawler.init();

console.log(`\n=== Starting seed process for user: ${username} ===\n`);

const multiredditLinks = await crawler.findMultis(username);

console.log(
  `Found ${multiredditLinks.length} multireddits for user ${username}:`,
);
multiredditLinks.forEach((link) => console.log(`  - ${link}`));

// Crawl each multireddit and collect subreddits
const subs: string[] = [];

for (const multiredditName of multiredditLinks) {
  console.log(`\nCrawling multireddit: /user/${username}/m/${multiredditName}`);
  const subreddits = await crawler.crawlMultireddit(username, multiredditName);

  subs.push(...subreddits);

  // Store each subreddit in the multireddit relationship
  for (const subreddit of subreddits) {
    await db.setMulti(multiredditName, subreddit);
  }

  console.log(`  Found ${subreddits.length} subreddits in ${multiredditName}`);
}

const seeded = Array.from(new Set([...subs]));
console.log(`Total subs found: ${seeded.length}`);

await db.addMultipleToQueue(seeded);
