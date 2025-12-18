import fs from "node:fs/promises";
import assert from "node:assert";

import { getJSON } from "./get-json.ts";

assert(process.env.GRAPH_DATA_FILE);

const nodes = getJSON();

await fs.writeFile(process.env.GRAPH_DATA_FILE, JSON.stringify(nodes, null, 2));
