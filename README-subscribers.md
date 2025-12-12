# Subscriber Count Feature Documentation

## Overview

This feature adds the ability to track and store Reddit subreddit subscriber counts in the crawler database. It includes:

1. **Automatic subscriber extraction** during regular crawling
2. **Bulk data filling script** for existing subreddits in the database
3. **Database support** for storing subscriber counts

## How It Works

### During Normal Crawling

When the crawler visits a subreddit using `crawlSubreddit()`, it now:
1. Extracts links to other subreddits (existing functionality)
2. Fetches the subscriber count using Reddit's JSON API
3. Stores both in the database

### Reddit JSON API

The crawler uses Reddit's `/about.json` endpoint to get subreddit information:
- Endpoint: `https://www.reddit.com/r/{subreddit}/about.json`
- Returns JSON with subscriber count in `data.subscribers` field
- Uses authenticated Playwright browser context to avoid 403 errors

## Implementation Details

### Crawler Changes (`src/crawler.ts`)

Added `extractSubscriberCount()` method that:
- Uses the authenticated browser context from Playwright
- Navigates to the JSON endpoint
- Parses the response to extract subscriber count
- Returns `null` on failure (graceful degradation)

The `crawlSubreddit()` method now returns:
```typescript
{
  links: string[];        // Array of discovered subreddit names
  subscribers: number | null;  // Subscriber count or null if unavailable
}
```

### Database Schema

The `subreddit_queue` table includes:
```sql
CREATE TABLE subreddit_queue (
  subreddit TEXT PRIMARY KEY,
  visited BOOLEAN DEFAULT FALSE,
  subscribers INTEGER DEFAULT NULL,  -- New field
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Database Methods (`src/database.ts`)

- `updateSubscribers(subreddit: string, subscribers: number)` - Updates subscriber count for a subreddit

## Fill Missing Data Script

### Purpose
Retroactively fetch subscriber counts for subreddits already in the database that don't have this data.

### Usage
```bash
# Run the fill-subscribers script
npm run fill-subscribers

# Or manually
node --experimental-strip-types --env-file=.env scripts/fill-subscriber-data.ts
```

### Configuration
Uses the same environment variables as the main crawler:
- `USERNAME` - Reddit username for authentication
- `PASSWORD` - Reddit password for authentication
- `USE_NSFW_DB` - Set to "true" to use graph-nsfw.db instead of graph.db
- `DELAY` - Delay between requests in milliseconds (default: 2000)

### Features
- Shows progress with `[current/total]` counter
- Displays fetched subscriber counts
- Automatic rate limiting (30-second pause every 30 requests)
- Summary statistics at completion
- Uses authenticated requests for better success rate

### Example Output
```
=== Fill Missing Subscriber Data ===

Using database: data/graph.db

Database Statistics:
  Total subreddits: 415
  With subscriber data: 0
  Missing subscriber data: 415

Found 415 subreddits with missing data

Initializing crawler with authentication...
Crawler initialized and logged in successfully

Using delay of 2000ms between requests

[1/415] Fetching r/apple... ✓ 3,456,789 subscribers
[2/415] Fetching r/programming... ✓ 4,123,456 subscribers
[3/415] Fetching r/rust... ✓ 234,567 subscribers
...

=== Summary ===
  Successfully updated: 410
  Failed: 5

=== Final Database Statistics ===
  Total subreddits: 415
  With subscriber data: 410 (98.8%)
  Still missing data: 5 (1.2%)
```

## Testing

A test script is available to verify the API functionality:

```bash
node --experimental-strip-types scripts/test-subscriber-api.ts
```

This script:
- Tests various subreddit sizes
- Shows detailed response data
- Helps debug API issues
- Provides rate limiting guidance

## Limitations & Considerations

### Rate Limiting
- Reddit enforces rate limits on API requests
- Default delay: 2000ms between requests
- Additional 30-second pause every 30 requests
- Adjust `DELAY` environment variable if needed

### Authentication Required
- Recent Reddit API changes require authentication
- The script uses Playwright with login credentials
- Unauthenticated requests will receive 403 errors

### Error Handling
- Failed requests return `null` (doesn't break the crawler)
- Private/banned subreddits may not return data
- Quarantined subreddits may require special handling

### Performance
- Each subscriber fetch requires a new page navigation
- Bulk operations can take significant time
- Example: 400 subreddits ≈ 15-20 minutes with delays

## Migration for Existing Databases

If you have an existing database without the `subscribers` column:

1. Run the migration script:
```bash
npm run migrate
```

2. Then fill the missing data:
```bash
npm run fill-subscribers
```

## Integration with Visualization

The subscriber count data can be used in visualizations to:
- Size nodes based on community scale
- Filter by minimum subscriber threshold
- Show subscriber statistics in tooltips
- Color-code by subscriber ranges
- Analyze correlation between connections and popularity

## Troubleshooting

### 403 Forbidden Errors
- Ensure `USERNAME` and `PASSWORD` are set in `.env`
- Verify credentials are correct
- Check if account has any restrictions

### Rate Limiting (429 errors)
- Increase `DELAY` value
- Add longer pauses in the script
- Run script during off-peak hours

### Missing Data After Running Script
Some subreddits may not return data due to:
- Being private or restricted
- Being banned or quarantined
- Temporary Reddit API issues
- Typos in subreddit names in database

### Script Hangs or Crashes
- Check browser initialization (Playwright/Firefox)
- Verify network connectivity
- Look for error messages in console
- Try reducing concurrent operations