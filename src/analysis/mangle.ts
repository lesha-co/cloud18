#!/usr/bin/env node

import assert from "node:assert";
import { getJSONFromFile } from "./get-json.ts";
import { NodeData } from "./common-types.ts";
import { getHubClusters, printClusters } from "./list-hub-clusters.ts";
import fs from "node:fs/promises";
assert(process.env.GRAPH_DATA_FILE);

const allNodeData = await getJSONFromFile();
const clusters = await getHubClusters(allNodeData);
printClusters(clusters, true);
const largestCommunity = clusters[0];
assert(largestCommunity);
const communityMembersSubs = new Set(
  largestCommunity.members.map((x) => x.subreddit),
);
const communityMembersIds = new Set(largestCommunity.members.map((x) => x.id));
// Get all node data

// Create a set of subreddit names in the largest community for fast lookup

// Filter node data to only include nodes from the largest community
const filteredNodeData: NodeData[] = allNodeData.filter((node) =>
  communityMembersSubs.has(node.subreddit),
);

console.log(
  `Filtered from ${allNodeData.length} to ${filteredNodeData.length} nodes`,
);

// Create the Mangle map: original ID -> shuffled ID
const Mangle = new Map<number, number>();

// Get all IDs from the filtered data

// Create a shuffled copy of the IDs
const shuffledIds = [...filteredNodeData.map((node) => node.id)];
for (let i = shuffledIds.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
}
const newIds = new Array(shuffledIds.length).fill(0).map((_, index) => index);

// Map original IDs to shuffled IDs
shuffledIds.forEach((originalId, index) => {
  Mangle.set(originalId, newIds[index]);
});

// Apply the mangle mapping to create new node data
const mangledNodeData: NodeData[] = filteredNodeData.map((node) => {
  const newId = Mangle.get(node.id);
  assert(newId !== undefined);

  // Map the linksTo array to new IDs, but only keep links within the community
  const newLinksTo = node.linksTo
    .map((targetId) => {
      // Check if the target is in our filtered set

      if (!communityMembersIds.has(targetId)) {
        return undefined; // Skip links outside the community
      }
      return Mangle.get(targetId);
    })
    .filter((id): id is number => id !== undefined);

  return {
    ...node,
    id: newId,
    linksTo: newLinksTo,
  };
});

// Sort by new ID for consistency
mangledNodeData.sort((a, b) => a.id - b.id);

await fs.writeFile(
  process.env.GRAPH_DATA_FILE,
  JSON.stringify(mangledNodeData, null, 2),
);
