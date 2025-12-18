#!/usr/bin/env node

import { NodeData, SubredditRow } from "./common-types.ts";
import { getJSONFromFile } from "./get-json.ts";

// Type definitions
type SubredditStats = {
  name: string;
  outDegree: number;
  inDegree: number;
  totalDegree: number;
  outConnections: string[];
  inConnections: string[];
};

type Graph = {
  nodes: Set<string>;
  adjacencyList: Map<string, Set<string>>;
};

type SmallSubreddit = Pick<SubredditRow, "id" | "subreddit">;

type CommunityWithHub = {
  name: SmallSubreddit;
  members: SmallSubreddit[];
};

// Class definitions
class ConnectedComponentsDetection {
  private graph: Graph;
  private visited: Set<string> = new Set();
  private components: Map<string, number> = new Map();

  constructor(graph: Graph) {
    this.graph = graph;
  }

  detect(): Map<string, number> {
    let componentId = 0;

    for (const node of this.graph.nodes) {
      if (!this.visited.has(node)) {
        const component: string[] = [];
        this.dfs(node, component);
        for (const componentNode of component) {
          this.components.set(componentNode, componentId);
        }

        componentId++;
      }
    }

    return this.components;
  }

  private dfs(node: string, component: string[]): void {
    this.visited.add(node);
    component.push(node);

    const neighbors = this.graph.adjacencyList.get(node) || new Set<string>();
    for (const neighbor of neighbors) {
      if (!this.visited.has(neighbor)) {
        this.dfs(neighbor, component);
      }
    }
  }
}

// Function definitions
function buildGraphFromNodeData(nodeData: NodeData[]): Graph {
  const nodes = new Set<string>();
  const adjacencyList = new Map<string, Set<string>>();

  // Create a map from numeric ID to subreddit name for quick lookup
  const idToSubreddit = new Map<number, string>();
  for (const node of nodeData) {
    idToSubreddit.set(node.id, node.subreddit);
    nodes.add(node.subreddit);
    adjacencyList.set(node.subreddit, new Set<string>());
  }

  // Build adjacency list from linksTo arrays
  for (const node of nodeData) {
    const fromSubreddit = node.subreddit;
    for (const toId of node.linksTo) {
      const toSubreddit = idToSubreddit.get(toId);
      if (toSubreddit) {
        adjacencyList.get(fromSubreddit)?.add(toSubreddit);
        // For undirected graph (connected components), add reverse edge
        if (!adjacencyList.has(toSubreddit)) {
          adjacencyList.set(toSubreddit, new Set<string>());
        }
        adjacencyList.get(toSubreddit)?.add(fromSubreddit);
      }
    }
  }

  return { nodes, adjacencyList };
}

function findHubInCommunity(
  community: SmallSubreddit[],
  nodeStats: Map<number, SubredditStats>,
): SmallSubreddit {
  let hub = community[0];
  let maxDegree = 0;

  for (const node of community) {
    const stats = nodeStats.get(node.id);
    if (stats && stats.totalDegree > maxDegree) {
      maxDegree = stats.totalDegree;
      hub = node;
    }
  }

  return hub;
}

export function calculateNodeStatistics(
  nodeData: NodeData[],
): Map<number, SubredditStats> {
  const stats = new Map<number, SubredditStats>();

  // Create a map from numeric ID to subreddit name
  const idToSubreddit = new Map<number, string>();
  for (const node of nodeData) {
    idToSubreddit.set(node.id, node.subreddit);
  }

  // Calculate in-degree for each node
  const inDegree = new Map<string, Set<string>>();
  for (const node of nodeData) {
    const fromSubreddit = node.subreddit;
    for (const toId of node.linksTo) {
      const toSubreddit = idToSubreddit.get(toId);
      if (toSubreddit) {
        if (!inDegree.has(toSubreddit)) {
          inDegree.set(toSubreddit, new Set<string>());
        }
        inDegree.get(toSubreddit)?.add(fromSubreddit);
      }
    }
  }

  // Build statistics for each node
  for (const node of nodeData) {
    const subredditName = node.subreddit;
    const outConnections = node.linksTo
      .map((id) => idToSubreddit.get(id))
      .filter((name): name is string => name !== undefined);

    const inConnections = Array.from(
      inDegree.get(subredditName) || new Set<string>(),
    );

    stats.set(node.id, {
      name: subredditName,
      outDegree: outConnections.length,
      inDegree: inConnections.length,
      totalDegree: outConnections.length + inConnections.length,
      outConnections,
      inConnections,
    });
  }

  return stats;
}

export function analyzeSubredditClusters(
  nodeData: NodeData[],
): CommunityWithHub[] {
  const graph = buildGraphFromNodeData(nodeData);
  const detector = new ConnectedComponentsDetection(graph);
  const components = detector.detect();
  const communityMembers = new Map<number, string[]>();

  for (const [node, communityId] of components.entries()) {
    if (!communityMembers.has(communityId)) {
      communityMembers.set(communityId, []);
    }
    communityMembers.get(communityId)!.push(node);
  }

  // Create a map of subreddit name to SmallSubreddit
  const subredditMap = new Map<string, SmallSubreddit>();
  for (const node of nodeData) {
    subredditMap.set(node.subreddit, {
      id: node.id,
      subreddit: node.subreddit,
    });
  }

  // Get node statistics for finding hubs
  const nodeStats = calculateNodeStatistics(nodeData);

  const communities: CommunityWithHub[] = Array.from(communityMembers.entries())
    .map(([id, memberNames]) => {
      const sortedNames = memberNames.sort((a, b) => a.localeCompare(b));
      const memberObjects = sortedNames
        .map((name) => subredditMap.get(name))
        .filter((member): member is SmallSubreddit => member !== undefined);

      const hub = findHubInCommunity(memberObjects, nodeStats);

      return {
        name: hub,
        members: memberObjects,
      };
    })
    .sort((a, b) => b.members.length - a.members.length);

  return communities;
}

export function printClusters(communities: CommunityWithHub[]): void {
  communities.forEach((community, index) => {
    if (community.members.length === 0) return;

    console.log(
      `- Group ${index + 1}: ${community.name.subreddit} (${community.members.length} subreddits)`,
    );
    community.members.forEach((subreddit) => {
      console.log(`  - ${subreddit.subreddit}`);
    });
    if (index < communities.length - 1) {
      console.log();
    }
  });
}

export async function getHubClusters(
  nodeDataArray: NodeData[],
): Promise<CommunityWithHub[]> {
  // analyzeSubredditClusters now returns CommunityWithHub[] directly
  return analyzeSubredditClusters(nodeDataArray);
}

// Main execution - only run when this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = await getJSONFromFile();
  const communities = await getHubClusters(json);
  printClusters(communities);
}
