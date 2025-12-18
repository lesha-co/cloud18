import fs from "fs";
import Database from "./database.ts";

// Define common types
export type Edge = {
  from_subreddit: string;
  to_subreddit: string;
};

type Graph = {
  nodes: Set<string>;
  adjacencyList: Map<string, Set<string>>;
};

type SubredditStats = {
  name: string;
  outDegree: number;
  inDegree: number;
  totalDegree: number;
  outConnections: string[];
  inConnections: string[];
};

type Community = {
  id: number;
  members: string[];
};

// Output format for printing
type ClusterOutput = {
  name: string;
  members: string[];
};

// Load data from SQLite database
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

  const edges = (await db.getAllEdges()) as Edge[];

  for (const edge of edges) {
    const { from_subreddit, to_subreddit } = edge;

    // Add nodes
    graph.nodes.add(from_subreddit);
    graph.nodes.add(to_subreddit);

    // Add edge (for undirected graph)
    if (!graph.adjacencyList.has(from_subreddit)) {
      graph.adjacencyList.set(from_subreddit, new Set<string>());
    }
    graph.adjacencyList.get(from_subreddit)!.add(to_subreddit);

    // For community detection, we treat the graph as undirected
    if (!graph.adjacencyList.has(to_subreddit)) {
      graph.adjacencyList.set(to_subreddit, new Set<string>());
    }
    graph.adjacencyList.get(to_subreddit)!.add(from_subreddit);
  }
  await db.close();
  return graph;
}

// Connected Components Detection
export class ConnectedComponentsDetection {
  private graph: Graph;
  private visited: Set<string> = new Set();
  private components: Map<string, number> = new Map();

  constructor(graph: Graph) {
    this.graph = graph;
  }

  detect(): Map<string, number> {
    let componentId = 0;

    // For each node in the graph
    for (const node of this.graph.nodes) {
      // If we haven't visited this node yet
      if (!this.visited.has(node)) {
        // Find all connected nodes (component)
        const component: string[] = [];
        this.dfs(node, component);

        // Assign all nodes in this component the same ID
        for (const componentNode of component) {
          this.components.set(componentNode, componentId);
        }

        componentId++;
      }
    }

    return this.components;
  }

  private dfs(node: string, component: string[]): void {
    // Mark node as visited
    this.visited.add(node);
    component.push(node);

    // Visit all unvisited neighbors
    const neighbors = this.graph.adjacencyList.get(node) || new Set<string>();
    for (const neighbor of neighbors) {
      if (!this.visited.has(neighbor)) {
        this.dfs(neighbor, component);
      }
    }
  }
}

// Find communities and organize them
export function findAndOrganizeClusters(
  components: Map<string, number>,
): Community[] {
  // Group by community ID
  const communityMembers = new Map<number, string[]>();

  for (const [node, communityId] of components.entries()) {
    if (!communityMembers.has(communityId)) {
      communityMembers.set(communityId, []);
    }
    communityMembers.get(communityId)!.push(node);
  }

  // Convert to array and sort by size (largest first)
  const communities: Community[] = Array.from(communityMembers.entries())
    .map(([id, members]) => ({
      id,
      members: members.sort((a, b) => a.localeCompare(b)), // Sort members alphabetically
    }))
    .sort((a, b) => b.members.length - a.members.length);

  return communities;
}

// Calculate node statistics (useful for finding hubs)
export function calculateNodeStatistics(
  graph: Graph,
): Map<string, SubredditStats> {
  const stats = new Map<string, SubredditStats>();

  for (const node of graph.nodes) {
    const outConnections = graph.adjacencyList.get(node) || new Set<string>();
    const inConnections = new Set<string>();

    // Find all nodes that have this node as their neighbor
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

// Find the hub node in a community
export function findHubInCommunity(
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

/**
 * Core cluster analysis function that serves as the base for both
 * regular community detection and hub-based community detection
 */
export async function analyzeSubredditClusters(
  dbPath: string,
): Promise<Community[]> {
  try {
    // Load graph data
    const graph = await loadGraphFromDatabase(dbPath);

    // Find connected components
    const detector = new ConnectedComponentsDetection(graph);
    const components = detector.detect();

    // Organize into clusters
    return findAndOrganizeClusters(components);
  } catch (error) {
    console.error("Error analyzing subreddit clusters:", error);
    throw error;
  }
}

// Print communities in the requested format
export function printClusters(communities: ClusterOutput[]): void {
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
