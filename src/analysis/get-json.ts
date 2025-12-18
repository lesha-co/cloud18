import Database from "../database/database.ts";
import { NodeData } from "./common-types.ts";
import fs from "node:fs/promises";
import z from "zod";

export async function getJSONFromFile(filename: string): Promise<NodeData[]> {
  return z
    .array(NodeData)
    .parse(JSON.parse(await fs.readFile(filename, "utf8")));
}

export async function getJSONFromDatabase(
  filename: string,
): Promise<NodeData[]> {
  const db = new Database();
  await db.open(filename, false);

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
    ...row,
    linksTo: edges.get(row.id) ?? [],
  }));

  await db.close();
  return nodes;
}
