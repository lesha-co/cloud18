import assert from "node:assert";
import Database from "../database/database.ts";
import { NodeData } from "./common-types.ts";

export async function getJSON(): Promise<NodeData[]> {
  const db = new Database();
  assert(process.env.DATABASE_FILE);
  await db.open(process.env.DATABASE_FILE, false);

  const edges = (await db.getAllEdgesIDs()).reduce(
    (acc, { from_id, to_id }) => {
      if (!acc.has(from_id)) {
        acc.set(from_id, []);
      }
      acc.set(from_id, [...acc.get(from_id)!, to_id]);
      return acc;
    },
    new Map<number, number[]>(),
  );

  const rows = await db.subreddits();

  const nodes: NodeData[] = rows.map((row) => ({
    id: row.id,
    subreddit: row.subreddit,
    nsfw: row.nsfw,
    subscribers: row.subscribers,
    linksTo: edges.get(row.id) ?? [],
  }));

  await db.close();
  return nodes;
}
