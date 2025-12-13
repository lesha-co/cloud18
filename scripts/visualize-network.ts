import sqlite3 from "sqlite3";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Edge {
  from_subreddit: string;
  to_subreddit: string;
}

interface Node {
  id: string;
  degree: number;
  subscribers: number | null;
  nsfw: boolean;
}

interface GraphData {
  nodes: Node[];
  links: { source: string; target: string }[];
}

// Read edges and subscriber data from database
async function readGraphData(dbPath: string): Promise<{
  edges: Edge[];
  subscribers: Map<string, number>;
  nsfw: Map<string, boolean>;
}> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

    let edges: Edge[] = [];
    let subscribers = new Map<string, number>();
    let nsfw = new Map<string, boolean>();

    // Read edges
    db.all(
      "SELECT from_subreddit, to_subreddit FROM subreddit_edges",
      (err, rows: Edge[]) => {
        if (err) {
          reject(err);
          db.close();
          return;
        }
        edges = rows;

        // Then read subscriber counts and nsfw status
        db.all(
          "SELECT subreddit, subscribers, nsfw FROM subreddit_queue",
          (err, rows: any[]) => {
            if (err) {
              reject(err);
            } else {
              rows.forEach((row) => {
                if (row.subscribers !== null) {
                  subscribers.set(row.subreddit, row.subscribers);
                }
                if (row.nsfw !== null) {
                  nsfw.set(row.subreddit, row.nsfw === 1);
                }
              });
              resolve({ edges, subscribers, nsfw });
            }
            db.close();
          },
        );
      },
    );
  });
}

// Process edges into nodes and links for visualization
function processEdges(
  edges: Edge[],
  subscribers: Map<string, number>,
  nsfw: Map<string, boolean>,
): GraphData {
  const nodeMap = new Map<string, number>();
  const links: { source: string; target: string }[] = [];

  // Process edges and count degree for each node
  edges.forEach((edge) => {
    // Count outgoing edges
    nodeMap.set(
      edge.from_subreddit,
      (nodeMap.get(edge.from_subreddit) || 0) + 1,
    );
    // Count incoming edges
    nodeMap.set(edge.to_subreddit, (nodeMap.get(edge.to_subreddit) || 0) + 1);

    links.push({
      source: edge.from_subreddit,
      target: edge.to_subreddit,
    });
  });

  // Create nodes array with degree, subscriber, and nsfw information
  const nodes: Node[] = Array.from(nodeMap.entries()).map(([id, degree]) => ({
    id,
    degree,
    subscribers: subscribers.get(id) || null,
    nsfw: nsfw.get(id) || false,
  }));

  return { nodes, links };
}

// Generate HTML with D3.js visualization
function generateHTML(graphData: GraphData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subreddit Network Map</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #1a1a1a;
            overflow: hidden;
        }

        #graph {
            width: 100vw;
            height: 100vh;
        }

        .node {
            cursor: pointer;
            stroke: #fff;
            stroke-width: 1.5px;
        }

        .node:hover {
            stroke-width: 3px;
        }

        .link {
            stroke: #666;
            stroke-opacity: 0.6;
            stroke-width: 1px;
        }

        .node-label {
            pointer-events: none;
            font-size: 10px;
            fill: #fff;
            text-anchor: middle;
            dominant-baseline: central;
            text-shadow: 0 0 3px #000, 0 0 3px #000;
        }

        #tooltip {
            position: absolute;
            padding: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            border-radius: 5px;
            pointer-events: none;
            display: none;
            font-size: 12px;
            border: 1px solid #444;
        }

        #controls {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            padding: 15px;
            border-radius: 5px;
            color: white;
            font-size: 12px;
        }

        #controls label {
            display: block;
            margin-bottom: 10px;
        }

        #controls input {
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div id="graph"></div>
    <div id="tooltip"></div>
    <div id="controls">
        <label>
            Link Strength: <input type="range" id="linkStrength" min="0.1" max="2" step="0.1" value="1">
            <span id="linkStrengthValue">1</span>
        </label>
        <label>
            Charge Force: <input type="range" id="chargeForce" min="-500" max="-50" step="10" value="-300">
            <span id="chargeForceValue">-300</span>
        </label>
    </div>

    <script>
        const graphData = ${JSON.stringify(graphData)};

        // Set up dimensions and margins
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Create SVG
        const svg = d3.select("#graph")
            .append("svg")
            .attr("width", width)
            .attr("height", height);

        // Create a group for zooming
        const g = svg.append("g");

        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.1, 10])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoom);

        // Color based on NSFW status: red for NSFW, green for non-NSFW
        const getNodeColor = (d) => {
            return d.nsfw ? '#ff4444' : '#44ff44';
        };

        // Create size scale for nodes based on subscribers (square root scale)
        const maxSubscribers = d3.max(graphData.nodes, d => d.subscribers || 0);
        const sizeScale = d3.scaleSqrt()
            .domain([0, maxSubscribers > 0 ? maxSubscribers : 10000])
            .range([5, 40]);

        // Function to get node size based on square root of subscriber count
        const getNodeSize = (d) => {
            // Use subscribers if available, otherwise use a default small size
            const value = d.subscribers || 1000;
            return sizeScale(value);
        };

        // Create force simulation
        const simulation = d3.forceSimulation(graphData.nodes)
            .force("link", d3.forceLink(graphData.links)
                .id(d => d.id)
                .distance(50))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(d => getNodeSize(d) + 2));

        // Create links
        const link = g.append("g")
            .selectAll("line")
            .data(graphData.links)
            .enter().append("line")
            .attr("class", "link");

        // Create nodes
        const node = g.append("g")
            .selectAll("circle")
            .data(graphData.nodes)
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", d => getNodeSize(d))
            .attr("fill", d => getNodeColor(d))
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        // Add labels
        const label = g.append("g")
            .selectAll("text")
            .data(graphData.nodes)
            .enter().append("text")
            .attr("class", "node-label")
            .text(d => d.id)
            .style("font-size", d => Math.min(getNodeSize(d) * 0.8, 14) + "px");

        // Tooltip
        const tooltip = d3.select("#tooltip");

        node
            .on("mouseover", (event, d) => {
                const connections = graphData.links.filter(l =>
                    l.source.id === d.id || l.target.id === d.id
                ).length;

                tooltip
                    .style("display", "block")
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 10) + "px")
                    .html(\`
                        <strong>r/\${d.id}</strong><br>
                        \${d.subscribers ? \`Subscribers: \${d.subscribers.toLocaleString()}<br>\` : ''}
                        NSFW: \${d.nsfw ? 'Yes' : 'No'}<br>
                        Connections: \${connections}<br>
                        Degree: \${d.degree}
                    \`);
            })
            .on("mouseout", () => {
                tooltip.style("display", "none");
            });

        // Update positions on tick
        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);

            label
                .attr("x", d => d.x)
                .attr("y", d => d.y);
        });

        // Drag functions
        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        // Controls
        const linkStrengthSlider = document.getElementById('linkStrength');
        const linkStrengthValue = document.getElementById('linkStrengthValue');
        const chargeForceSlider = document.getElementById('chargeForce');
        const chargeForceValue = document.getElementById('chargeForceValue');

        linkStrengthSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            linkStrengthValue.textContent = value;
            simulation.force("link").strength(+value);
            simulation.alpha(0.3).restart();
        });

        chargeForceSlider.addEventListener('input', (e) => {
            const value = e.target.value;
            chargeForceValue.textContent = value;
            simulation.force("charge").strength(+value);
            simulation.alpha(0.3).restart();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' || e.key === 'R') {
                // Reset zoom
                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity
                );
            }
        });
    </script>
</body>
</html>`;
}

async function main() {
  try {
    if (!process.env.DATABASE_FILE) {
      throw new Error("DATABASE_FILE environment variable is not set");
    }
    const dbPath = path.join(__dirname, "..", process.env.DATABASE_FILE);
    const outputPath = path.join(__dirname, "..", "network-visualization.html");

    console.log("Reading graph data from database...");
    const { edges, subscribers, nsfw } = await readGraphData(dbPath);
    console.log(`Found ${edges.length} edges`);
    console.log(`Found ${subscribers.size} subreddits with subscriber data`);
    console.log(`Found ${nsfw.size} subreddits with NSFW status`);

    console.log("Processing graph data...");
    const graphData = processEdges(edges, subscribers, nsfw);
    console.log(
      `Created graph with ${graphData.nodes.length} nodes and ${graphData.links.length} links`,
    );

    // Log some statistics about subscriber counts
    const nodesWithSubs = graphData.nodes.filter((n) => n.subscribers !== null);
    if (nodesWithSubs.length > 0) {
      const maxSubs = Math.max(...nodesWithSubs.map((n) => n.subscribers!));
      const minSubs = Math.min(...nodesWithSubs.map((n) => n.subscribers!));
      console.log(
        `Subscriber range: ${minSubs.toLocaleString()} - ${maxSubs.toLocaleString()}`,
      );
    }

    console.log("Generating HTML visualization...");
    const html = generateHTML(graphData);

    console.log("Writing output file...");
    await fs.writeFile(outputPath, html);

    console.log(`\n✅ Network visualization created successfully!`);
    console.log(
      `📊 Open 'network-visualization.html' in your browser to view the network map`,
    );
    console.log(`\nFeatures:`);
    console.log(
      `- Nodes are sized proportional to square root of subscriber count`,
    );
    console.log(`- NSFW subreddits are colored red, non-NSFW are green`);
    console.log(
      `- Connected nodes are pulled together by force-directed layout`,
    );
    console.log(`- Drag nodes to reposition them`);
    console.log(`- Scroll to zoom in/out`);
    console.log(`- Press 'R' to reset zoom`);
    console.log(`- Hover over nodes for details`);
    console.log(`- Adjust force parameters with the controls`);
  } catch (error) {
    console.error("Error creating visualization:", error);
    process.exit(1);
  }
}

main();
