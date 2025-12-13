#!/usr/bin/env node

import assert from "node:assert";
import {
  analyzeSubredditClusters,
  loadGraphFromDatabase,
  calculateNodeStatistics,
  findHubInCommunity,
  printClusters,
} from "./shared/subreddit-graph.ts";

assert(process.env.DATABASE_FILE);

const graph = await loadGraphFromDatabase(process.env.DATABASE_FILE);
const nodeStats = calculateNodeStatistics(graph);
const baseClusters = await analyzeSubredditClusters(process.env.DATABASE_FILE);

// For each cluster, identify the hub (node with most connections)
const communities = baseClusters
  .map((cluster) => {
    const hubName = findHubInCommunity(cluster.members, nodeStats);

    // Sort members alphabetically but put hub first
    const sortedMembers = [...cluster.members].sort((a, b) => {
      if (a === hubName) return -1;
      if (b === hubName) return 1;
      return a.localeCompare(b);
    });

    return {
      name: hubName,
      members: sortedMembers,
    };
  })
  .sort((a, b) => b.members.length - a.members.length); // Sort by size descending

printClusters(communities);
