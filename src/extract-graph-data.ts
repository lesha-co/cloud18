import fs from "node:fs/promises";
import assert from "node:assert";
import Database from "./database.ts";
import z from "zod";

interface NodeData {
  id: number;
  name: string;
  nsfw: boolean;
  subscribers: number;
}

interface GraphDataJSON {
  nodes: NodeData[];
  edges: [number, number][];
}

// Read graph data from database and process it for visualization
async function extractGraphData(dbPath: string): Promise<GraphDataJSON> {
  const db = new Database();
  await db.open(dbPath, false);

  const nodeIdToIndex = new Map<string, number>();

  const Item = z.object({
    id: z.number(),
    subreddit: z.string(),
    subscribers: z.number(),
    nsfw: z.union([z.literal(0), z.literal(1)]),
  });
  // Read subreddit data
  const rows = z
    .array(Item)
    .parse(
      await db.all(
        "SELECT id, subreddit, subscribers, nsfw FROM subreddit_queue",
      ),
    );

  const nodes: NodeData[] = rows.map((row) => ({
    id: row.id,
    name: row.subreddit,
    nsfw: row.nsfw === 1,
    subscribers: row.subscribers,
  }));

  nodes.forEach((node) => {
    nodeIdToIndex.set(node.name, node.id);
  });

  // Read edges from database
  const edges = (await db.getAllEdgesIDs()).map(
    (e) => [e.from_id, e.to_id] as [number, number],
  );

  db.close();

  return { nodes, edges };
}

// Main execution
assert(
  process.env.DATABASE_FILE,
  "DATABASE_FILE environment variable is required",
);
assert(
  process.env.GRAPH_DATA_FILE,
  "GRAPH_DATA_FILE environment variable is required",
);

const graphData = await extractGraphData(process.env.DATABASE_FILE);

console.log(
  `Extracted ${graphData.nodes.length} nodes and ${graphData.edges.length} edges`,
);

// Write JSON to file
await fs.writeFile(
  process.env.GRAPH_DATA_FILE,
  JSON.stringify(graphData, null, 2),
);

console.log(`Graph data written to ${process.env.GRAPH_DATA_FILE}`);
