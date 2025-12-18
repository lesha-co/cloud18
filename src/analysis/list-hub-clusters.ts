#!/usr/bin/env node

import assert from "node:assert";
import { getJSON } from "./get-json.ts";
import { NodeData } from "./common-types.ts";

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

type Community = {
  id: number;
  members: string[];
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
  community: string[],
  nodeStats: Map<string, SubredditStats>,
): string {
  let hub = community[0];
  let maxDegree = 0;

  for (const node of community) {
    const stats = nodeStats.get(node);
    if (stats && stats.totalDegree > maxDegree) {
      maxDegree = stats.totalDegree;
      hub = node;
    }
  }

  return hub;
}

export function calculateNodeStatistics(
  nodeData: NodeData[],
): Map<string, SubredditStats> {
  const stats = new Map<string, SubredditStats>();

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

    stats.set(subredditName, {
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

function findAndOrganizeClusters(components: Map<string, number>): Community[] {
  const communityMembers = new Map<number, string[]>();

  for (const [node, communityId] of components.entries()) {
    if (!communityMembers.has(communityId)) {
      communityMembers.set(communityId, []);
    }
    communityMembers.get(communityId)!.push(node);
  }

  const communities: Community[] = Array.from(communityMembers.entries())
    .map(([id, members]) => ({
      id,
      members: members.sort((a, b) => a.localeCompare(b)), // alphabetically
    }))
    .sort((a, b) => b.members.length - a.members.length);

  return communities;
}

export function analyzeSubredditClusters(nodeData: NodeData[]): Community[] {
  const graph = buildGraphFromNodeData(nodeData);
  const detector = new ConnectedComponentsDetection(graph);
  const components = detector.detect();
  return findAndOrganizeClusters(components);
}

export function printClusters(
  communities: { members: string[]; name: string }[],
): void {
  communities.forEach((community, index) => {
    if (community.members.length === 0) return;

    console.log(
      `- Group ${index + 1}: ${community.name} (${community.members.length} subreddits)`,
    );
    community.members.forEach((subreddit) => {
      console.log(`  - ${subreddit}`);
    });
    if (index < communities.length - 1) {
      console.log();
    }
  });
}

// Main execution
assert(process.env.DATABASE_FILE);

const nodeDataArray = await getJSON();
const nodeStats = calculateNodeStatistics(nodeDataArray);
const baseClusters = analyzeSubredditClusters(nodeDataArray);

printClusters(
  baseClusters
    .map((cluster) => ({
      name: findHubInCommunity(cluster.members, nodeStats),
      members: cluster.members,
    }))
    .sort((a, b) => b.members.length - a.members.length),
);
