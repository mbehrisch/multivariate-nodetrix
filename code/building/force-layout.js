import { svg } from '../main.js';
import { cellSize } from '../main.js';
import { width, height } from '../main.js';

let simulation = null;

export function getSimulation() {
    return simulation;
}

export function applyForceLayout(graph, nodes, links, dummyMap, matrixGroups) {
    // Define the simulation on updated nodes and links
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
            .id(d => d.id)
            .distance(100) // Define the distance between linked nodes
        )
        .force("charge", d3.forceManyBody().strength(-50)) // Apply charge force to repel nodes
        .force("center", d3.forceCenter(width / 2, height / 2)) // Center the force layout

        // Prevent collision between nodes and matrices
        .force("collide", d3.forceCollide().radius(d => {
            // Give dummy nodes a larger collision radius based on matrix size
            if (d.id && d.id.startsWith("dummy-")) {
                return d.matrixSize * cellSize * 1.5;
            }
            return d.r + 10; // Default NL node collision radius
        }))
        .on("tick", ticked); // Call ticked function on each simulation step
    
    // Run the simulation to initialize positions
    function ticked() {
        // Move node-link nodes and labels
        svg.selectAll(".node")
            .attr("cx", d => d.x = Math.max(10, Math.min(width - 10, d.x)))
            .attr("cy", d => d.y = Math.max(20, Math.min(height - 10, d.y)));

        // Update labels with node positions
        svg.selectAll(".NLlabel")
            .attr("x", d => d.x) // Follow node's x position
            .attr("y", d => d.y) // Follow node's y position, with an offset to prevent overlap
            .style("pointer-events", "none"); // Optional: Prevent labels from interfering with node dragging


        // Move dummy nodes and attached matrices
        Object.entries(dummyMap).forEach(([dummyId, matrixGroup]) => {
            const dummyNode = getNode(dummyId);

            // Get matrix size for bounds calculation
            const matrixSize = dummyNode.matrixSize;
            const matrixWidth = matrixSize * cellSize;
            const matrixHeight = matrixSize * cellSize;

            // Clamp dummy node position so matrix stays in bounds (as well as labels)
            dummyNode.x = Math.max(20, Math.min(800 - matrixWidth, dummyNode.x));
            dummyNode.y = Math.max(20, Math.min(600 - matrixHeight, dummyNode.y));

            matrixGroup.attr("transform", `translate(${dummyNode.x}, ${dummyNode.y})`);
        });

        // Update NL links
        svg.selectAll(".NLlink")
            .attr("d", d => {
                const sourcePos = getNode(d.source);
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos);
            });

        // Update matrix-NL links
        svg.selectAll(".matrix-NL-link")
            .attr("d", d => {
                const sourcePos = MatrixNodeLinkPositions(d.source, d.target, true); // Matrix to Node link
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos);
            });

        // Update matrix-matrix links
        svg.selectAll(".matrix-matrix-link")
            .attr("d", d => {
                const sourcePos = MatrixNodeLinkPositions(d.source, d.target, false); // Matrix to Matrix link
                const targetPos = MatrixNodeLinkPositions(d.target, d.source, false);
                return getBezierPath(sourcePos, targetPos);
            });
    }

    // Helper to resolve node from ID or object
    function getNode(n) {
        if (typeof n === 'object') return n;
        return nodes.find(d => d.id === n);
    }

    // Helper function to draw Bezier paths
    function getBezierPath(sourcePos, targetPos) {
        const verticalOffset = 10;
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;

        // Midpoint between source and target
        const midX = sourcePos.x + dx / 2;

        // Add offset to reduce overlap — push up/down based on direction
        const controlY1 = sourcePos.y + (dy > 0 ? verticalOffset : -verticalOffset);
        const controlY2 = targetPos.y + (dy > 0 ? -verticalOffset : verticalOffset);

        return `M${sourcePos.x},${sourcePos.y}
                C${midX},${controlY1}
                ${midX},${controlY2}
                ${targetPos.x},${targetPos.y}`;
    }

    // Helper function to find the matrix node position as well as either the external node position (either matrix or node)
    function MatrixNodeLinkPositions(sourceNode, targetNode, targetIsNode) {
        // Find matrix group and dummy node of source node
        const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(sourceNode));
        const dummy = getNode(`dummy-${matrixId}`);
        const matrixX = dummy.x;
        const matrixY = dummy.y;

        const matrixNodeIds = matrixGroups[matrixId];
        const rowIndex = matrixNodeIds.indexOf(sourceNode);
        const matrixSize = matrixNodeIds.length;

        // Compute matrix cell center of source node
        const cellY = matrixY + rowIndex * cellSize + cellSize / 2;
        const colX = matrixX + rowIndex * cellSize + cellSize / 2;

        // Initialize
        let dx, dy;

        if (!targetIsNode) {
            // Find the matrix it is in and its dummy
            const otherMatrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(targetNode));
            const otherDummy = getNode(`dummy-${otherMatrixId}`);

            // Direction from matrix to external node
            dx = otherDummy.x - dummy.x;
            dy = otherDummy.y - dummy.y;
        } else {
            // Read the direction of the node directly
            dx = getNode(targetNode).x - dummy.x;
            dy = getNode(targetNode).y - dummy.y;
        }

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Link to left or right of row
        if (absDx > absDy) {
            if (dx > 0) {
                // Right
                return { x: matrixX + matrixSize * cellSize, y: cellY };
            } else {
                // Left
                return { x: matrixX - cellSize, y: cellY };
            }
        } else {
            // Link to top or bottom of column
            if (dy > 0) {
                // Bottom
                return { x: colX, y: matrixY + matrixSize * cellSize };
            } else {
                // Top
                return { x: colX, y: matrixY - cellSize };
            }
        }
    }
}
