import RedditCrawler from "./crawler.ts";
import Database from "./database.ts";
import { resolve } from "node:path";
import { seed } from "./seed.ts";

try {
  // Get configuration from environment variables
  const cookiesFilePath = process.env.COOKIES_FILE;
  const databaseFilePath =
    process.env.DATABASE_FILE || resolve("./reddit_graph.db");
  const delay = parseInt(process.env.DELAY || "2000", 10);
  const maxSubreddits = parseInt(process.env.MAX_SUBREDDITS || "5", 10);

  if (!cookiesFilePath) {
    console.error("Error: COOKIES_FILE environment variable not set");
    process.exit(1);
  }

  console.log("Initializing Reddit Subreddit Crawler");
  console.log(`- Using cookies from: ${cookiesFilePath}`);
  console.log(`- Database path: ${databaseFilePath}`);
  console.log(`- Request delay: ${delay}ms`);
  console.log(`- Max subreddits to process: ${maxSubreddits}`);

  // Initialize database
  const db = new Database(databaseFilePath);

  // Add initial "apple" subreddit to the queue
  // await db.addToQueue("apple");
  // console.log('Added initial subreddit "apple" to queue');

  // Initialize crawler
  const crawler = new RedditCrawler(delay);
  await crawler.init();

  // Check if we should seed from a user's multireddits
  const username = process.env.USERNAME;
  let seeded = ["apple"];
  if (username) {
    console.log(`\nSeeding from user: ${username}'s multireddits...`);
    seeded = await seed(username, crawler);
  }
  db.addMultipleToQueue(seeded);

  // Process subreddits using the generator
  let count = 0;
  for await (const subreddit of db.getUnvisitedGenerator()) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    if (count >= maxSubreddits) {
      console.log(
        `Reached maximum subreddit limit (${maxSubreddits}). Stopping.`,
      );
      break;
    }

    console.log(
      `Processing subreddit ${count + 1}/${maxSubreddits}: r/${subreddit}`,
    );

    // Crawl the subreddit and get links to other subreddits
    const sub = await crawler.crawlSubreddit(subreddit);

    // Update subscriber count if available
    if (sub.subscribers !== null) {
      await db.updateSubscribers(subreddit, sub.subscribers);
    }

    // Add the discovered subreddits to the queue and create edges
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
} catch (error) {
  console.error("Error in main process:", error);
  process.exit(1);
}
