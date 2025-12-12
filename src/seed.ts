import RedditCrawler from "./crawler.ts";

interface MultiredditInfo {
  name: string;
  subreddits: string[];
}

/**
 * Seed function that crawls a user's multireddits and finds common subreddits
 * @param username - The Reddit username to crawl
 * @param crawler - The initialized RedditCrawler instance
 * @param db - The initialized Database instance
 */
export async function seed(
  username: string,
  crawler: RedditCrawler,
): Promise<string[]> {
  console.log(`\n=== Starting seed process for user: ${username} ===\n`);

  // First, we need to find all multireddit links from the user's page
  const multiredditLinks = await findUserMultireddits(crawler, username);

  if (multiredditLinks.length === 0) {
    console.log(`No multireddits found for user ${username}`);
    return [];
  }

  console.log(
    `Found ${multiredditLinks.length} multireddits for user ${username}:`,
  );
  multiredditLinks.forEach((link) => console.log(`  - ${link}`));

  // Crawl each multireddit and collect subreddits
  const subs = (
    await Promise.all(
      multiredditLinks.map(async (multiredditName) => {
        console.log(
          `\nCrawling multireddit: /user/${username}/m/${multiredditName}`,
        );
        const subreddits = await crawler.crawlMultireddit(
          username,
          multiredditName,
        );

        return subreddits;

        console.log(
          `  Found ${subreddits.length} subreddits in ${multiredditName}`,
        );
      }),
    )
  ).flat();

  const subsSet = Array.from(new Set([...subs]));

  console.log(`Total multireddits processed: ${subsSet.length}`);

  return subsSet;
}

/**
 * Find all multireddit links from a user's profile page
 * @param username - The Reddit username
 * @returns Array of multireddit names
 */
async function findUserMultireddits(
  crawler: RedditCrawler,
  username: string,
): Promise<string[]> {
  console.log(`Visiting user profile: https://www.reddit.com/user/${username}`);

  return await crawler.findMultis(username);
}

/**
 * Find common subreddits that appear in multiple multireddits
 * @param multiredditData - Array of multireddit info
 * @returns Array of common subreddits with the multireddits they appear in
 */
function findCommonSubreddits(
  multiredditData: MultiredditInfo[],
): Array<{ subreddit: string; multireddits: string[] }> {
  const subredditToMultireddits = new Map<string, string[]>();

  // Build a map of subreddit to multireddits it appears in
  for (const multireddit of multiredditData) {
    for (const subreddit of multireddit.subreddits) {
      if (!subredditToMultireddits.has(subreddit)) {
        subredditToMultireddits.set(subreddit, []);
      }
      subredditToMultireddits.get(subreddit)!.push(multireddit.name);
    }
  }

  // Filter to only subreddits that appear in multiple multireddits
  const commonSubreddits: Array<{ subreddit: string; multireddits: string[] }> =
    [];

  for (const [subreddit, multireddits] of subredditToMultireddits.entries()) {
    if (multireddits.length > 1) {
      commonSubreddits.push({
        subreddit,
        multireddits: multireddits,
      });
    }
  }

  // Sort by number of multireddits they appear in (descending)
  commonSubreddits.sort(
    (a, b) => b.multireddits.length - a.multireddits.length,
  );

  return commonSubreddits;
}

export default seed;
