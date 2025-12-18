#!/usr/bin/env node

import assert from "node:assert";
import Database from "../database/database.ts";
import fs from "node:fs";

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

function calculateNodeStatistics(graph: Graph): Map<string, SubredditStats> {
  const stats = new Map<string, SubredditStats>();

  for (const node of graph.nodes) {
    const outConnections = graph.adjacencyList.get(node) || new Set<string>();
    const inConnections = new Set<string>();

    for (const [src, neighbors] of graph.adjacencyList.entries()) {
      if (neighbors.has(node) && src !== node) {
        inConnections.add(src);
      }
    }

    stats.set(node, {
      name: node,
      outDegree: outConnections.size,
      inDegree: inConnections.size,
      totalDegree: outConnections.size + inConnections.size,
      outConnections: Array.from(outConnections),
      inConnections: Array.from(inConnections),
    });
  }

  return stats;
}

export async function loadGraphFromDatabase(dbPath: string): Promise<Graph> {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const db = new Database();
  await db.open(dbPath, true);

  const graph: Graph = {
    nodes: new Set<string>(),
    adjacencyList: new Map<string, Set<string>>(),
  };

  const edges = await db.getAllEdges();

  for (const edge of edges) {
    const { from_subreddit, to_subreddit } = edge;

    graph.nodes.add(from_subreddit);
    graph.nodes.add(to_subreddit);

    if (!graph.adjacencyList.has(from_subreddit)) {
      graph.adjacencyList.set(from_subreddit, new Set<string>());
    }
    graph.adjacencyList.get(from_subreddit)!.add(to_subreddit);

    if (!graph.adjacencyList.has(to_subreddit)) {
      graph.adjacencyList.set(to_subreddit, new Set<string>());
    }
    graph.adjacencyList.get(to_subreddit)!.add(from_subreddit);
  }
  await db.close();
  return graph;
}

export async function analyzeSubredditClusters(
  dbPath: string,
): Promise<Community[]> {
  try {
    const graph = await loadGraphFromDatabase(dbPath);

    const detector = new ConnectedComponentsDetection(graph);
    const components = detector.detect();

    return findAndOrganizeClusters(components);
  } catch (error) {
    console.error("Error analyzing subreddit clusters:", error);
    throw error;
  }
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

type SubredditStats = {
  name: string;
  outDegree: number;
  inDegree: number;
  totalDegree: number;
  outConnections: string[];
  inConnections: string[];
};

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

type Graph = {
  nodes: Set<string>;
  adjacencyList: Map<string, Set<string>>;
};

type Community = {
  id: number;
  members: string[];
};
