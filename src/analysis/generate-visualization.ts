import fs from "node:fs/promises";
import assert from "node:assert";
import z from "zod";
import { NodeData } from "./common-types.ts";

assert(process.env.GRAPH_DATA_FILE);
assert(process.env.OUT_NETWORK);
assert(process.env.TEMPLATE_FILE);

async function generateHTML(
  graphData: NodeData[],
  templatePath: string,
): Promise<string> {
  const template = await fs.readFile(templatePath, "utf-8");
  return template.replace("%TEMPLATE%", JSON.stringify(graphData));
}

// Main execution
const jsonContent = await fs.readFile(process.env.GRAPH_DATA_FILE, "utf-8");
const jsonData = z.array(NodeData).parse(JSON.parse(jsonContent));
const html = await generateHTML(jsonData, process.env.TEMPLATE_FILE);
await fs.writeFile(process.env.OUT_NETWORK, html);
