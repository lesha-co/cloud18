/**
 * Split graph to several isolated graphs
 */

import assert from "node:assert";
import { NodeData } from "./common-types.ts";
import { getJSONFromFile } from "./get-json.ts";

export function getHubClusters(graph: NodeData[]): NodeData[][] {
  // create index for lookup
  const map: Map<number, NodeData> = new Map();
  for (const node of graph) {
    map.set(node.id, node);
  }

  // Build reverse edges map (for incoming connections)
  const incomingEdges: Map<number, Set<number>> = new Map();
  for (const node of graph) {
    for (const targetId of node.linksTo) {
      if (!incomingEdges.has(targetId)) {
        incomingEdges.set(targetId, new Set());
      }
      incomingEdges.get(targetId)!.add(node.id);
    }
  }

  // Track visited nodes
  const visited: Set<number> = new Set();
  const components: NodeData[][] = [];

  // DFS helper function
  function dfs(nodeId: number, component: NodeData[]): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = map.get(nodeId);
    if (!node) return;

    component.push(node);

    // Visit all neighbors (outgoing edges)
    for (const neighborId of node.linksTo) {
      if (!visited.has(neighborId)) {
        dfs(neighborId, component);
      }
    }

    // Visit all neighbors (incoming edges - treating graph as undirected)
    const incoming = incomingEdges.get(nodeId);
    if (incoming) {
      for (const neighborId of incoming) {
        if (!visited.has(neighborId)) {
          dfs(neighborId, component);
        }
      }
    }
  }

  // Find all connected components
  for (const node of graph) {
    if (!visited.has(node.id)) {
      const component: NodeData[] = [];
      dfs(node.id, component);
      if (component.length > 0) {
        components.push(component);
      }
    }
  }

  // Sort components by size (largest first)
  components.sort((a, b) => b.length - a.length);

  return components;
}

export function printClusters(
  communities: NodeData[][],
  condensed = false,
): void {
  communities.forEach((community, index) => {
    if (community.length === 0) return;

    console.log(`- Group ${index + 1}: ${community.length} subreddits)`);
    if (!condensed) {
      community.forEach((subreddit) => {
        console.log(`  - ${subreddit.subreddit}`);
      });
    }
  });
}

// Main execution - only run when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  assert(process.env.GRAPH_DATA_FILE);
  const json = await getJSONFromFile(process.env.GRAPH_DATA_FILE);
  const communities = getHubClusters(json);
  printClusters(communities, true);
}
