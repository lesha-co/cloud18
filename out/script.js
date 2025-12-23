import {
  forceCollide,
  forceCenter,
  forceManyBody,
} from "https://esm.sh/d3-force";
import rawData from "./graph-nsfw.json" with { type: "json" };

function getRadius(nodePopulation) {
  return Math.sqrt(nodePopulation) / 10;
}

// Transform the raw graph data to force-graph format
function transformGraphData(jsonData) {
  // Create a map for quick ID to node lookup
  const nodeMap = new Map();
  jsonData.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  // Calculate degree for each node
  const inDegree = new Map();
  jsonData.forEach((node) => {
    node.linksTo.forEach((targetId) => {
      inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
    });
  });

  // Transform nodes
  const nodes = jsonData.map((node) => {
    const isMulti = node.subreddit.startsWith("multi:");
    const outDegree = node.linksTo.length;
    const inDegreeCount = inDegree.get(node.id) || 0;
    const totalDegree = outDegree + inDegreeCount;

    return {
      id: node.subreddit, // Use subreddit name as ID
      nodeId: node.id, // Keep numeric ID for reference
      name: node.subreddit,
      nsfw: node.nsfw ? 1 : 0,
      subscribers: node.subscribers ?? 0,
      isMulti,
      degree: totalDegree,
      val: getRadius(node.subscribers), // Node size based on subscribers
    };
  });

  // Extract links from the linksTo arrays
  const links = [];
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

        links.push({
          source: fromId,
          target: toId,
          isMultiLink,
          value: isMultiLink ? 2 : 1,
        });
      }
    });
  });

  return { nodes, links };
}

// Transform the raw data
const graphData = transformGraphData(rawData);
console.log(
  `Transformed to ${graphData.nodes.length} nodes and ${graphData.links.length} links`,
);

// Create the force graph
const elem = document.getElementById("graph");
const Graph = new ForceGraph(elem);

Graph.backgroundColor("#1a1a1a")
  .nodeRelSize(10)
  .nodeVal((node) => node.val)
  .nodeColor((node) => {
    if (node.isMulti) return "#4444ff";
    return node.nsfw ? "#ff4444" : "#44ff44";
  })
  .nodeCanvasObjectMode(() => "replace")
  .nodeCanvasObject((node, ctx, globalScale) => {
    const label = node.isMulti
      ? node.name.replace("multi:", "m:")
      : node.name.replace("r/", "");
    const fontSize = Math.max(12, node.val / 2);

    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);

    // Set fill color based on node type
    if (node.isMulti) {
      ctx.fillStyle = "#4444ff";
    } else {
      ctx.fillStyle = node.nsfw ? "#ff4444" : "#44ff44";
    }
    ctx.fill();

    // Draw border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw text label
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Add text shadow for better readability
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillText(label, node.x + 1, node.y + 1);

    // Draw actual text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, node.x, node.y);
  })
  .nodeLabel((node) => {
    const connections = graphData.links.filter(
      (l) => l.source.id === node.id || l.target.id === node.id,
    ).length;

    if (node.isMulti) {
      return `<div style="background: rgba(0,0,0,0.9); padding: 8px; border-radius: 4px; border: 1px solid #444;">
                  <strong>Multi: ${node.name.replace("multi:", "")}</strong><br>
                  Subreddits: ${Math.floor(node.subscribers / 1000)}<br>
                  Connections: ${connections}<br>
                  Degree: ${node.degree}
                </div>`;
    }
    return `<div style="background: rgba(0,0,0,0.9); padding: 8px; border-radius: 4px; border: 1px solid #444;">
                <strong>r/${node.name}</strong><br>
                Subscribers: ${node.subscribers.toLocaleString()}<br>
                NSFW: ${node.nsfw ? "Yes" : "No"}<br>
                Connections: ${connections}<br>
                Degree: ${node.degree}
              </div>`;
  })
  .linkColor((link) => (link.isMultiLink ? "#8888ff99" : "#66666699"))
  .linkWidth((link) => (link.isMultiLink ? 2 : 1))
  .enableNodeDrag(true)
  .enableZoomPanInteraction(true)
  .d3AlphaDecay(0.01)
  .d3VelocityDecay(0.1)

  .d3Force(
    "collide",
    forceCollide((node) => {
      return node.val * 1.5;
    }),
  )
  .d3Force("charge", forceManyBody().strength(-100))
  .d3Force("center", forceCenter())
  .graphData(graphData)
  .linkDirectionalArrowLength(6);

// Node click to open subreddit
Graph.onNodeClick((node) => {
  if (node) {
    if (node.isMulti) {
      // Multi-reddits have a different URL structure
      const multiName = node.name.replace("multi:", "");
      window.open(`https://www.reddit.com/me/m/${multiName}`, "_blank");
    } else {
      // Regular subreddit
      window.open(`https://www.reddit.com/r/${node.name}`, "_blank");
    }
  }
});

// Node hover effects
Graph.onNodeHover((node) => {
  elem.style.cursor = node ? "pointer" : "default";
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") {
    // Reset zoom
    Graph.centerAt(0, 0, 1000);
    Graph.zoom(1, 1000);
  } else if (e.key === " ") {
    // Space to pause/resume
    e.preventDefault();
    pauseAnimationCheckbox.checked = !pauseAnimationCheckbox.checked;
    if (pauseAnimationCheckbox.checked) {
      Graph.pauseAnimation();
    } else {
      Graph.resumeAnimation();
    }
  }
});
