# Reddit Subreddit Graph Crawler - Implementation TODO List

Notes: Do not use typescript transpilation at all. Use node --experimental-strip-types

## Project Setup
- [ ] Initialize npm project with `package.json` (type: module)
- [ ] make start script using "node --experimental-strip-types"
- [ ] Install Playwright (`npm install playwright`)
- [ ] Install better-sqlite3 (`npm install better-sqlite3`)
- [ ] Set up project directory structure
- [ ] Create `.gitignore` file

## Database Implementation
- [ ] Create database connection module
- [ ] Implement schema for subreddit edges table (from_subreddit, to_subreddit)
- [ ] Implement schema for queue table (subreddit, visited, added_at)
- [ ] Create indexes for performance optimization
- [ ] Implement functions for adding edges
- [ ] Implement functions for checking if edges exist
- [ ] Create transaction handling for batch operations

## Queue Management
- [ ] Implement functions to add subreddits to queue
- [ ] Implement functions to mark subreddits as visited
- [ ] Create function to get next batch of unvisited subreddits
- [ ] Implement duplicate checking before adding to queue

## Reddit Crawler
- [ ] Set up Playwright browser initialization
- [ ] Implement cookie loading from file
- [ ] Create navigation function to visit subreddits
- [ ] Implement parser to extract subreddit links from pages
- [ ] Add rate limiting and delay mechanisms
- [ ] Create error handling for network issues, invalid subreddits
- [ ] Implement proper User-Agent setting

## Main Application
- [ ] Create entry point with command-line arguments for initial subreddits
- [ ] Implement main processing loop
- [ ] Add graceful shutdown and resumption capability
- [ ] Create logging system for tracking progress
- [ ] Implement configurable processing limits (max subreddits, time limits, etc)

## Testing and Validation
- [ ] Create test script with sample subreddits
- [ ] Verify edge detection is working correctly
- [ ] Validate database schema and queue functionality
- [ ] Test resumption after stopping the crawler
- [ ] Verify cookie authentication is working

## Documentation
- [ ] Document database schema
- [ ] Add usage instructions in README.md
- [ ] Document cookie file format requirements
- [ ] Add sample commands and examples

## Optional Enhancements
- [ ] Add visualization capability for the graph
- [ ] Implement additional metadata collection (subscriber count, creation date)
- [ ] Create statistical analysis of the graph
- [ ] Add NSFW content filtering option
- [ ] Implement parallel processing with configurable concurrency
