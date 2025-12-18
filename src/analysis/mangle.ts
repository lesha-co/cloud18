/**
 * This code shuffles IDs of entries so that it's impossible to discern
 * the initial subreddits
 */

import assert from "node:assert";
import { getJSONFromFile } from "./get-json.ts";
import { NodeData } from "./common-types.ts";
import { getHubClusters } from "./list-hub-clusters.ts";
import fs from "node:fs/promises";
assert(process.env.GRAPH_DATA_FILE);

const allNodeData = await getJSONFromFile(process.env.GRAPH_DATA_FILE);
const clusters = await getHubClusters(allNodeData);

// selecting members from clusters with > 10
const selectedMembers = clusters
  .filter((x) => x.members.length > 10)
  .flatMap((x) => x.members);

// building indexes for quick lookup
const communityMembersSubs = new Set(selectedMembers.map((x) => x.subreddit));
const communityMembersIds = new Set(selectedMembers.map((x) => x.id));

// removing anything that is not selected
const filteredNodeData: NodeData[] = allNodeData.filter((node) =>
  communityMembersSubs.has(node.subreddit),
);

console.log(
  `Filtered from ${allNodeData.length} to ${filteredNodeData.length} nodes`,
);

// original ids will have "holes" i.e. 1,2,4,6,10 because we've removed some of them
const mangledIDs = new Map<number, number>();
// new ids will not so that the consumer will not know how many there were and if there
const newIds = new Array(filteredNodeData.length)
  .fill(0)
  .map((_, index) => index);
// shuffling and mapping original to new ones
const shuffledIds = [...filteredNodeData.map((node) => node.id)];
for (let i = shuffledIds.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
}

shuffledIds.forEach((originalId, index) => {
  mangledIDs.set(originalId, newIds[index]);
});

const mangledNodeData: NodeData[] = filteredNodeData.map((node) => {
  const newId = mangledIDs.get(node.id);
  assert(newId !== undefined);

  // mangledIDs only have keys for selected subs
  // so map will return undefined for links outside
  // in current script that shouldn't be the case because I'm selecting
  // one (or several) groups that are self-contained
  const newLinksTo = node.linksTo
    .map((targetId) => mangledIDs.get(targetId))
    .filter((id) => id !== undefined);

  return {
    ...node,
    id: newId,
    linksTo: newLinksTo,
  };
});

mangledNodeData.sort((a, b) => a.id - b.id);

await fs.writeFile(
  process.env.GRAPH_DATA_FILE,
  JSON.stringify(mangledNodeData, null, 2),
);
