import fs from "node:fs/promises";
import assert from "node:assert";
import z from "zod";

// Define the schema for the actual JSON structure
const NodeDataSchema = z.object({
  id: z.number(),
  subreddit: z.string(),
  nsfw: z.union([z.literal(0), z.literal(1)]),
  subscribers: z.number().nullable(),
  linksTo: z.array(z.number()),
});

type NodeData = z.infer<typeof NodeDataSchema>;

interface VisualizationNode {
  id: string;
  degree: number;
  meta: { nsfw: 0 | 1; subs: number };
  isMulti?: boolean;
}

interface VisualizationEdge {
  from_subreddit: string;
  to_subreddit: string;
  type?: string;
}

interface VisualizationData {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
}

assert(process.env.GRAPH_DATA_FILE);
assert(process.env.OUT_NETWORK);
assert(process.env.TEMPLATE_FILE);

function transformGraphData(jsonData: NodeData[]): VisualizationData {
  // Create a map for quick ID to node lookup
  const nodeMap = new Map<number, NodeData>();
  jsonData.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  // Calculate degree for each node (in-degree + out-degree)
  const inDegree = new Map<number, number>();
  jsonData.forEach((node) => {
    // Out-degree is the length of linksTo
    node.linksTo.forEach((targetId) => {
      inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
    });
  });

  // Transform nodes
  const nodes: VisualizationNode[] = jsonData.map((node) => {
    const isMulti = node.subreddit.startsWith("multi:");
    const nodeId = node.subreddit; // Use subreddit name as ID directly
    const outDegree = node.linksTo.length;
    const inDegreeCount = inDegree.get(node.id) || 0;
    const totalDegree = outDegree + inDegreeCount;

    return {
      id: nodeId,
      degree: totalDegree,
      meta: {
        nsfw: node.nsfw,
        subs: node.subscribers ?? 0, // Use 0 if null
      },
      isMulti,
    };
  });

  // Extract edges from the linksTo arrays
  const edges: VisualizationEdge[] = [];
  jsonData.forEach((fromNode) => {
    fromNode.linksTo.forEach((toNodeId) => {
      const toNode = nodeMap.get(toNodeId);
      if (toNode) {
        const fromId = fromNode.subreddit;
        const toId = toNode.subreddit;

        // Determine if this is a multi-link
        const isMultiLink =
          fromNode.subreddit.startsWith("multi:") ||
          toNode.subreddit.startsWith("multi:");

        edges.push({
          from_subreddit: fromId,
          to_subreddit: toId,
          ...(isMultiLink ? { type: "multi-link" } : {}),
        });
      }
    });
  });

  return { nodes, edges };
}

async function generateHTML(
  visualizationData: VisualizationData,
  templatePath: string,
): Promise<string> {
  const template = await fs.readFile(templatePath, "utf-8");
  return template.replace("%TEMPLATE%", JSON.stringify(visualizationData));
}

// Main execution
const jsonContent = await fs.readFile(process.env.GRAPH_DATA_FILE, "utf-8");
const jsonData = z.array(NodeDataSchema).parse(JSON.parse(jsonContent));

console.log(`Loaded ${jsonData.length} nodes`);

const visualizationData = transformGraphData(jsonData);

console.log(
  `Transformed to ${visualizationData.nodes.length} nodes and ${visualizationData.edges.length} edges`,
);

const html = await generateHTML(visualizationData, process.env.TEMPLATE_FILE);
await fs.writeFile(process.env.OUT_NETWORK, html);

console.log("Visualization generated successfully!");
