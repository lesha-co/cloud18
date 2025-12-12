# Reddit Subreddit Graph Crawler - Project Plan

## Overview
This project will create a graph representation of how subreddits are interconnected by analyzing links between them. Using Node.js with Playwright and SQLite, the application will systematically crawl Reddit, starting from a given list of subreddits, discover links to other subreddits, and store these relationships in a database.

## Architecture

### Project Structure
```
2025-12-reddit-bubbles-playwright/
├── src/
│   ├── index.ts           # Main entry point
│   ├── database.ts        # Database management
│   ├── crawler.ts         # Subreddit crawler
│   ├── queue.ts           # Queue database operations
│   └── types.ts           # Type definitions
├── package.json
├── tsconfig.json
└── .gitignore
```

### Technology Stack
- **Node.js** - Runtime environment
- **TypeScript** - For type safety
- **Playwright** - For browser automation to scrape Reddit
- **SQLite** (using better-sqlite3) - For storing the graph relationships and queue
- **Type: module** - Using ES modules

### Core Components

#### 1. Database Manager (`database.ts`)
- Initialize SQLite database
- Create tables for:
  - Subreddit graph edges (from_subreddit, to_subreddit)
  - Queue tracking (subreddit, visited, added_at)
- Functions for:
  - Adding new edges
  - Checking if an edge already exists
  - Adding subreddits to the queue
  - Getting next unvisited subreddits
  - Marking subreddits as visited

#### 2. Queue Manager (`queue.ts`)
- Functions for database queue operations:
  - Adding subreddits to queue table (if not already in queue)
  - Getting next batch of unvisited subreddits
  - Marking subreddits as visited
  - Checking if a subreddit has been visited

#### 3. Crawler (`crawler.ts`)
- Initialize Playwright browser
- Load Reddit authentication cookies from file
- Functions for:
  - Navigating to a subreddit
  - Extracting links to other subreddits
  - Handling Reddit's pagination (if needed)
  - Error handling

#### 4. Main Application Logic (`index.ts`)
- Initialize components
- Accept initial list of subreddits
- Core loop:
  1. Get next unvisited subreddit from queue table
  2. Visit the subreddit page with authentication cookies
  3. Extract links to other subreddits
  4. Add new edges to database
  5. Add discovered subreddits to queue table (if not already there)
  6. Mark current subreddit as visited
  7. Repeat until no unvisited subreddits remain or max limit reached

## Database Schema

```sql
-- Table for subreddit connections
CREATE TABLE IF NOT EXISTS subreddit_edges (
  from_subreddit TEXT NOT NULL,
  to_subreddit TEXT NOT NULL,
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_subreddit, to_subreddit)
);

-- Table for processing queue
CREATE TABLE IF NOT EXISTS subreddit_queue (
  subreddit TEXT PRIMARY KEY,
  visited BOOLEAN DEFAULT FALSE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_edges_from ON subreddit_edges(from_subreddit);
CREATE INDEX IF NOT EXISTS idx_edges_to ON subreddit_edges(to_subreddit);
CREATE INDEX IF NOT EXISTS idx_queue_visited ON subreddit_queue(visited);
```

## Processing Flow

1. **Initialization**:
   - Create/connect to SQLite database
   - Create tables if they don't exist
   - Add initial subreddits to queue table

2. **Main Loop**:
   - While unvisited subreddits exist in queue:
     - Get next unvisited subreddit from queue table
     - Visit the subreddit page using Playwright with loaded cookies
     - Extract links to other subreddits
     - For each found subreddit:
       - Add edge to database (if not exists)
       - Add subreddit to queue table (if not already in queue)
     - Mark current subreddit as visited in queue table

3. **Error Handling**:
   - Handle network errors
   - Handle Reddit rate limiting
   - Handle invalid subreddits
   - Log errors but continue processing

4. **Termination**:
   - Exit when all subreddits in queue have been visited or after processing a configurable maximum number
   - Close browser and database connections

## Authentication Handling

Reddit authentication will be handled by loading cookies from a pre-existing cookies.sqlite file. This approach:
- Avoids having to implement a login flow
- Allows access to restricted subreddits
- Prevents being blocked as a bot

The cookies will be loaded and applied to the Playwright browser context before making any requests.

## Technical Considerations

1. **Rate Limiting**: 
   - Implement delays between requests
   - Consider implementing progressive backoff for failed requests

2. **Robustness**:
   - Since queue is in database, application can be stopped and resumed at any time
   - Consider adding a "last_attempt" timestamp to track and retry failed subreddits

3. **Efficiency**:
   - Use prepared statements for frequent database operations
   - Consider batch processing multiple subreddits in parallel (with care for rate limits)
   - Use transactions for batch insertions

4. **Storage Efficiency**:
   - Add a "processed_count" column to track how many subreddits have been processed
   - Consider adding a "skip" flag for problematic subreddits

5. **Compliance**:
   - Respect robots.txt
   - Add proper user-agent
   - Consider adding delays between requests to be kind to Reddit's servers

## Implementation Timeline

1. **Week 1**: Setup and Basic Implementation
   - Set up project structure and dependencies
   - Implement database schema and basic operations
   - Create queue management functions

2. **Week 2**: Crawler Implementation
   - Implement Playwright browser setup with cookie authentication
   - Create subreddit page parser
   - Implement rate limiting and error handling

3. **Week 3**: Integration and Testing
   - Connect all components
   - Test with small set of subreddits
   - Refine and optimize

4. **Week 4**: Finalization and Documentation
   - Add command-line arguments and configuration
   - Create comprehensive documentation
   - Perform final testing and optimization

## Future Enhancements

1. **Visualization** - Create a web interface to visualize the subreddit graph
2. **Data Analysis** - Implement algorithms to find communities, central subreddits, etc.
3. **Content Analysis** - Analyze post content to determine subreddit themes
4. **User Flow Analysis** - Track how users move between subreddits
5. **Scheduled Updates** - Run periodic crawls to track how the graph changes over time

## Conclusion

This project will create a comprehensive map of subreddit interconnections, providing valuable insights into the structure of Reddit communities. The queue-based approach with database persistence ensures robustness and resumability, while the use of Playwright with cookie authentication allows access to a wide range of subreddits.
