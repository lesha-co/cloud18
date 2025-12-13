#!/usr/bin/env node

import RedditCrawler from "../src/crawler.ts";
import Database from "../src/database.ts";

const dbPath = process.env.DATABASE_FILE || "./reddit_graph.db";
const delay = parseInt(process.env.DELAY || "2000", 10);
const crawler = new RedditCrawler();

// Get subreddits with missing data
const database = new Database(dbPath);
const subreddits = await database.getSubredditsWithoutMeta();

console.log(`Found ${subreddits.length} subreddits with missing data\n`);

// Fill data
for (const [i, subreddit] of subreddits.entries()) {
  const meta = await crawler.extractMeta(subreddit);
  if (meta) {
    await database.updateSubscribers(subreddit, meta.subscribers);
    await database.updateNSFW(subreddit, meta.over18);
    console.log(
      `[${i + 1}/${subreddits.length}] r/${subreddit}: ${meta.subscribers.toLocaleString()}, ${meta.over18 ? "NSFW" : ""}`,
    );
  } else {
    console.log(`[${i + 1}/${subreddits.length}] r/${subreddit}: failed`);
  }
  if (i < subreddits.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

database.close();
