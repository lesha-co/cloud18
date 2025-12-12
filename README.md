# Reddit Subreddit Graph Crawler

This application crawls Reddit to create a graph of subreddit connections, storing them in a SQLite database. It uses Playwright for browser automation and Firefox cookies for authentication. Written in TypeScript and runs directly with Node.js without transpilation.

The crawler can be seeded either from a default subreddit or from a Reddit user's multireddits, finding common subreddits between them to build an interconnected graph.

## Proof of Concept

This initial version is a minimal proof of concept that:

1. Sets up a SQLite database with tables for subreddit edges and a processing queue
2. Processes multiple subreddits starting with r/apple by default
3. Finds links to other subreddits on each visited page
4. Adds the discovered subreddits to the queue and creates edges in the database
5. Uses a generator function to efficiently iterate through unvisited subreddits

## Prerequisites

- Node.js (v24+) with TypeScript support
- Firefox browser with a logged-in Reddit session
- Access to your Firefox profile's cookies.sqlite file

## Setup

1. Clone this repository:
   ```
   git clone <repository-url>
   cd 2025-12-reddit-bubbles-playwright
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with the required configuration:
   ```
   COOKIES_FILE=/path/to/your/firefox/profile/cookies.sqlite
   DATABASE_FILE=reddit_graph.db
   DELAY=2000
   MAX_SUBREDDITS=5
   USERNAME=your_reddit_username  # Optional: seed from a user's multireddits
   ```

   Replace `/path/to/your/firefox/profile/cookies.sqlite` with the actual path to your Firefox profile's cookies.sqlite file.
   
   To find your Firefox profile folder:
   - Open Firefox and go to `about:support`
   - Look for the "Profile Directory" or "Profile Folder" entry
   - Click "Open Directory" or "Show in Finder/Explorer"
   - The cookies.sqlite file is located in this directory

## Running the Crawler

Start the crawler with:

```
node --experimental-strip-types --env-file=.env src/index.ts
```

The crawler will now automatically collect subscriber counts for each subreddit it visits.

## Network Visualization

Generate an interactive network visualization:

```
npm run visualize
```

This creates `network-visualization.html` with:
- **Node size**: Based on subscriber count (when available) or degree
- **Node color**: Based on degree (number of connections)
- **Force-directed layout**: Connected nodes cluster together
- **Interactive controls**: Drag nodes, zoom, adjust force parameters
- **Tooltips**: Show subscriber count, connections, and degree

## Database Migration

If you have an existing database without the subscribers field, run:

```
npm run migrate
```

This will add the `subscribers` column to your existing `subreddit_queue` table.

### Default Mode (without USERNAME)

If no USERNAME is provided, the crawler will:
1. Initialize the database
2. Add "apple" subreddit to the queue
3. Iterate through unvisited subreddits using a generator function
4. Process each subreddit page up to the MAX_SUBREDDITS limit
5. Extract links to other subreddits
6. Add discovered subreddits to the queue
7. Create edges between subreddits in the database

### Seed Mode (with USERNAME)

If USERNAME is provided in the environment, the crawler will:
1. Visit the specified user's Reddit profile
2. Find all multireddit links (format: `/user/{username}/m/{multireddit}`)
3. Crawl each multireddit to extract its component subreddits
4. Identify common subreddits that appear in multiple multireddits
5. Create bidirectional edges between subreddits within each multireddit
6. Add all discovered subreddits to the queue for further processing
7. Continue with the standard crawling process

This seed mode is useful for:
- Building a graph centered around a user's interests
- Finding connections between curated collections of subreddits
- Discovering overlapping communities across different topics

## Database Structure

The SQLite database contains two main tables:

### subreddit_edges

Stores connections between subreddits:
- `from_subreddit`: Source subreddit name
- `to_subreddit`: Target subreddit name
- `discovered_at`: Timestamp when the connection was found

### subreddit_queue

Tracks subreddits to be processed:
- `subreddit`: Subreddit name
- `visited`: Boolean flag indicating whether the subreddit has been processed
- `subscribers`: Number of subscribers (populated when the subreddit is visited)
- `added_at`: Timestamp when the subreddit was added to the queue

## Seed Function

The seed function (`seed()` in `src/seed.ts`) provides an alternative way to initialize the crawling process:

- **Input**: A Reddit username (via `process.env.USERNAME`)
- **Process**:
  - Visits the user's profile page
  - Extracts all multireddit links
  - Crawls each multireddit to get component subreddits
  - Identifies common subreddits across multireddits
  - Creates dense connections within each multireddit group
- **Output**: Populated database with initial subreddits and edges

Example multireddit URL: `https://www.reddit.com/user/example_user/m/technology`

## Next Steps

This proof of concept can be expanded to:
1. Process larger portions of the queue with configurable limits
2. Add more error handling and rate limiting
3. Implement parallel processing
4. ~~Create visualization tools for the graph~~ ✅ Implemented with D3.js force-directed layout
5. Add support for crawling custom feeds and collections
6. Implement weighted edges based on connection strength
7. ~~Collect and visualize subscriber counts~~ ✅ Implemented - node sizes reflect community size

## License

ISC
