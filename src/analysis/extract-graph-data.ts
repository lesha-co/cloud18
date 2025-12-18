import fs from "node:fs/promises";
import assert from "node:assert";
import Database from "../database/database.ts";
import { NodeData } from "./common-types.ts";

assert(process.env.DATABASE_FILE);
assert(process.env.GRAPH_DATA_FILE);

const db = new Database();
await db.open(process.env.DATABASE_FILE, false);

const edges = (await db.getAllEdgesIDs()).reduce((acc, { from_id, to_id }) => {
  if (!acc.has(from_id)) {
    acc.set(from_id, []);
  }
  acc.set(from_id, [...acc.get(from_id)!, to_id]);
  return acc;
}, new Map<number, number[]>());

const rows = await db.subreddits();

const nodes: NodeData[] = rows.map((row) => ({
  id: row.id,
  subreddit: row.subreddit,
  nsfw: row.nsfw,
  subscribers: row.subscribers,
  linksTo: edges.get(row.id) ?? [],
}));

db.close();

await fs.writeFile(process.env.GRAPH_DATA_FILE, JSON.stringify(nodes, null, 2));
