/**
 * This script extracts data from database and puts it into json file
 */
import fs from "node:fs/promises";
import assert from "node:assert";
import { getJSONFromDatabase } from "./get-json.ts";

assert(process.env.GRAPH_DATA_FILE);
assert(process.env.DATABASE_FILE);

await fs.writeFile(
  process.env.GRAPH_DATA_FILE,
  JSON.stringify(await getJSONFromDatabase(process.env.DATABASE_FILE), null, 2),
);
