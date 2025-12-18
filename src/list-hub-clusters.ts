#!/usr/bin/env node

import assert from "node:assert";
import {
  analyzeSubredditClusters,
  loadGraphFromDatabase,
  calculateNodeStatistics,
  findHubInCommunity,
  printClusters,
} from "./subreddit-graph.ts";

assert(process.env.DATABASE_FILE);

const graph = await loadGraphFromDatabase(process.env.DATABASE_FILE);
const nodeStats = calculateNodeStatistics(graph);
const baseClusters = await analyzeSubredditClusters(process.env.DATABASE_FILE);

printClusters(
  baseClusters
    .map((cluster) => ({
      name: findHubInCommunity(cluster.members, nodeStats),
      members: cluster.members,
    }))
    .sort((a, b) => b.members.length - a.members.length),
);
