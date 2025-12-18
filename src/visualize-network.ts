import sqlite3 from "sqlite3";
import fs from "node:fs/promises";
import assert from "node:assert";
import { type Edge } from "./subreddit-graph.ts";
import Database from "./database.ts";

type ExtendedEdge = Edge & { type?: string };

interface Node {
  id: string;
  degree: number;
  meta: { nsfw: boolean; subs: number };
  isMulti?: boolean;
}

interface GraphData {
  nodes: Node[];
  edges: ExtendedEdge[];
}

// Read graph data from database and process it for visualization
async function readAndProcessGraphData(dbPath: string): Promise<GraphData> {
  const db = new Database();
  await db.open(dbPath, false);
  const nodeMap = new Map<string, number>();
  const meta = new Map<string, { nsfw: boolean; subs: number }>();
  const multiNodes = new Map<string, Set<string>>();

  const rows = (await db.all(
    "SELECT subreddit, subscribers, nsfw FROM subreddit_queue",
  )) as any[];

  rows.forEach((row) => {
    meta.set(row.subreddit, { nsfw: row.nsfw === 1, subs: row.subscribers });
    // nodeMap.set(row.subreddit, 0);
  });

  // Read multis from database
  const multiRows = (await db.all(
    "SELECT multi_name, subreddit_name FROM multis",
  )) as any[];

  // Group subreddits by multi
  multiRows.forEach((row) => {
    if (!multiNodes.has(row.multi_name)) {
      multiNodes.set(row.multi_name, new Set());
    }
    multiNodes.get(row.multi_name)!.add(row.subreddit_name);
  });

  const edges = (await db.getAllEdges()) as Edge[];
  // Read edges

  // Add edges from multis to their subreddits
  const allEdges: ExtendedEdge[] = [...edges];
  multiNodes.forEach((subreddits, multiName) => {
    subreddits.forEach((subreddit) => {
      // Only add edge if the subreddit exists in our meta data
      if (meta.has(subreddit)) {
        allEdges.push({
          from_subreddit: `multi:${multiName}`,
          to_subreddit: subreddit,
          type: "multi-link",
        });
      }
    });
  });

  // Process edges and count degree for each node
  allEdges.forEach((edge) => {
    // Count outgoing edges
    nodeMap.set(
      edge.from_subreddit,
      (nodeMap.get(edge.from_subreddit) || 0) + 1,
    );
    // Count incoming edges
    nodeMap.set(edge.to_subreddit, (nodeMap.get(edge.to_subreddit) || 0) + 1);
  });

  // Create nodes array with degree, subscriber, and nsfw information
  const nodes: Node[] = Array.from(nodeMap.entries()).map(([id, degree]) => {
    // Check if this is a multi node
    if (id.startsWith("multi:")) {
      const multiName = id.substring(6);
      const subredditCount = multiNodes.get(multiName)?.size || 0;
      // For multi nodes, create synthetic metadata
      return {
        id,
        degree,
        meta: { nsfw: false, subs: subredditCount * 1000 }, // Use subreddit count * 1000 as a proxy for size
        isMulti: true,
      };
    }

    const thisMeta = meta.get(id);
    if (!thisMeta) throw new Error(`no meta for ${id}`);
    return {
      id,
      degree,
      meta: thisMeta,
      isMulti: false,
    };
  });
  console.log("edges.length", allEdges.length);
  console.log("nodes.length", nodes.length);
  console.log("rows.length", rows.length);
  console.log("nodeMap.size", nodeMap.size);
  console.log("multis count", multiNodes.size);
  db.close();

  return { nodes, edges: allEdges };
}

// Generate HTML with D3.js visualization
async function generateHTML(graphData: GraphData) {
  const template = await fs.readFile("src/template.html", "utf-8");
  return template.replace("%TEMPLATE%", JSON.stringify(graphData));
}

assert(process.env.DATABASE_FILE);
assert(process.env.OUT_NETWORK);

const graphData = await readAndProcessGraphData(process.env.DATABASE_FILE);

console.log(
  `Created graph with ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`,
);

const html = await generateHTML(graphData);

console.log("Writing output file...");
await fs.writeFile(process.env.OUT_NETWORK, html);

console.log("ok");
