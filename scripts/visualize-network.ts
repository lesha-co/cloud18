import sqlite3 from "sqlite3";
import fs from "node:fs/promises";
import assert from "node:assert";
import type { Edge } from "./shared/subreddit-graph.ts";

interface Node {
  id: string;
  degree: number;
  subscribers: number | null;
  nsfw: boolean;
}

interface GraphData {
  nodes: Node[];
  links: { source: string; target: string }[];
}

// Read edges and subscriber data from database
async function readGraphData(dbPath: string): Promise<{
  edges: Edge[];
  subscribers: Map<string, number>;
  nsfw: Map<string, boolean>;
}> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    let edges: Edge[] = [];
    let subscribers = new Map<string, number>();
    let nsfw = new Map<string, boolean>();

    // Read edges
    db.all(
      "SELECT from_subreddit, to_subreddit FROM subreddit_edges",
      (err, rows: Edge[]) => {
        if (err) {
          reject(err);
          db.close();
          return;
        }
        edges = rows;

        // Then read subscriber counts and nsfw status
        db.all(
          "SELECT subreddit, subscribers, nsfw FROM subreddit_queue",
          (err, rows: any[]) => {
            if (err) {
              reject(err);
            } else {
              rows.forEach((row) => {
                if (row.subscribers !== null) {
                  subscribers.set(row.subreddit, row.subscribers);
                }
                if (row.nsfw !== null) {
                  nsfw.set(row.subreddit, row.nsfw === 1);
                }
              });
              resolve({ edges, subscribers, nsfw });
            }
            db.close();
          },
        );
      },
    );
  });
}

// Process edges into nodes and links for visualization
function processEdges(
  edges: Edge[],
  subscribers: Map<string, number>,
  nsfw: Map<string, boolean>,
): GraphData {
  const nodeMap = new Map<string, number>();
  const links: { source: string; target: string }[] = [];

  // Process edges and count degree for each node
  edges.forEach((edge) => {
    // Count outgoing edges
    nodeMap.set(
      edge.from_subreddit,
      (nodeMap.get(edge.from_subreddit) || 0) + 1,
    );
    // Count incoming edges
    nodeMap.set(edge.to_subreddit, (nodeMap.get(edge.to_subreddit) || 0) + 1);

    links.push({
      source: edge.from_subreddit,
      target: edge.to_subreddit,
    });
  });

  // Create nodes array with degree, subscriber, and nsfw information
  const nodes: Node[] = Array.from(nodeMap.entries()).map(([id, degree]) => ({
    id,
    degree,
    subscribers: subscribers.get(id) || null,
    nsfw: nsfw.get(id) || false,
  }));

  return { nodes, links };
}

// Generate HTML with D3.js visualization
async function generateHTML(graphData: GraphData) {
  const template = await fs.readFile("scripts/shared/template.html", "utf-8");
  return template.replace("%TEMPLATE%", JSON.stringify(graphData));
}

assert(process.env.DATABASE_FILE);
assert(process.env.OUT_NETWORK);

const g = await readGraphData(process.env.DATABASE_FILE);
const graphData = processEdges(g.edges, g.subscribers, g.nsfw);

console.log(
  `Created graph with ${graphData.nodes.length} nodes and ${graphData.links.length} links`,
);

const html = await generateHTML(graphData);

console.log("Writing output file...");
await fs.writeFile(process.env.OUT_NETWORK, html);

console.log("ok");
