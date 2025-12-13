#!/usr/bin/env node

import assert from "node:assert";
import {
  analyzeSubredditClusters,
  printClusters,
} from "./shared/subreddit-graph.ts";

assert(process.env.DATABASE_FILE);

const clusters = await analyzeSubredditClusters(process.env.DATABASE_FILE);

const namedClusters = clusters.map((cluster, index) => ({
  name: `Community ${index + 1}`,
  members: cluster.members,
}));

printClusters(namedClusters);
