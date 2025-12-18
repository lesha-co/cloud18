/**
 * process the list of subreddits.
 * Add metadata, add new subreddits to the list
 */
import Database from "../database/database.ts";
import RedditCrawler from "./crawler.ts";

const sleep = (d: number) => new Promise((r) => setTimeout(r, d));

export async function processList(
  subs: Iterable<string> | AsyncIterable<string>,
  crawler: RedditCrawler,
  delay: number,
  getUnfinished: (() => Promise<number> | number) | undefined,
  db: Database,
) {
  let count = 0;
  for await (const subreddit of subs) {
    await sleep(delay);

    console.log(
      `${count + 1}/${(await getUnfinished?.()) ?? "unknown"}: r/${subreddit}`,
    );

    const sub = await crawler.crawlSubreddit(subreddit);

    if (sub.meta !== null) {
      await db.updateMeta(subreddit, sub.meta.over18, sub.meta.subscribers);
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
}
