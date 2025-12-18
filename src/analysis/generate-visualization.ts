/**
 * this script gets data from a json dump and puts it into html template
 * template has this placeholder line:
 * <script>
 *     const rawData = %TEMPLATE%;
 * </script>
 */

import fs from "node:fs/promises";
import assert from "node:assert";
import { getJSONFromFile } from "./get-json.ts";

assert(process.env.GRAPH_DATA_FILE);
assert(process.env.OUT_NETWORK);
assert(process.env.TEMPLATE_FILE);

const jsonData = await getJSONFromFile(process.env.GRAPH_DATA_FILE);
const template = await fs.readFile(process.env.TEMPLATE_FILE, "utf-8");

await fs.writeFile(
  process.env.OUT_NETWORK,
  template.replace("%TEMPLATE%", JSON.stringify(jsonData)),
);
