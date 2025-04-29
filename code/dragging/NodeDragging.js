import { buildEverything } from '../utils.js';
import { svg, cellSize, appState } from '../main.js';

let previouslyOverlappingNodeId = null;

export function nodeDragStarted(event) {
    const sim = appState.sim;  // Access simulation from appState

    // Ensure simulation is slow and active
    if (!event.active) {
        sim.alphaTarget(0.005)
            .velocityDecay(0.99)
            .force("charge", d3.forceManyBody().strength(-1)) // Configure charge force
            .force("link", d3.forceLink().distance(500))  // Configure link force
            .restart();
    }

    // Move with mouse
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // Highlight the dragged node
    const draggedNode = d3.select(event.sourceEvent.target);
    draggedNode.classed("highlighted", true);
}

export function nodeDragged(event) {
    const sim = appState.sim;  // Access simulation from appState
    const allNodes = sim.nodes();

    event.subject.fx = event.x;
    event.subject.fy = event.y;

    // Check for overlap with nodes and matrices
    getOverlappingNodes(event.subject, allNodes);
    NodeMatrixOverlap(event.subject);
}

export function nodeDragEnded(event) {
    const sim = appState.sim;  // Access simulation from appState

    if (!event.active) {
        sim.velocityDecay(0.4)
            .force("charge", d3.forceManyBody().strength(-50))  // Apply charge force to repel nodes
            .force("link", d3.forceLink().distance(100))  // Set link distance
            .alphaTarget(0.3)  // Set alpha target to simulate temperature decrease
            .restart();
        setTimeout(() => sim.alphaTarget(0), 500);
    }

    // Reset dragged node position
    event.subject.fx = null;
    event.subject.fy = null;

    // Reset highlighting
    svg.selectAll(".node").classed("highlighted", false);
    svg.selectAll(".matrix").classed("matrixHighlighted", false);

    const overlappingNode = getOverlappingNodes(event.subject, sim.nodes());
    if (overlappingNode) {
        const newMatrixId = Math.max(0, ...Object.keys(appState.matrixGroups).map(id => +id || 0)) + 1;
        appState.matrixGroups[newMatrixId] = [event.subject.id, overlappingNode.id];
        buildEverything();
        return;
    }

    const { isInside, matrixId } = NodeMatrixOverlap(event.subject);
    if (isInside) {
        appState.matrixGroups[matrixId].push(event.subject.id);
        buildEverything();
        return;
    }
}

function getOverlappingNodes(draggedNode, allNodes) {
    const overlappingNode = allNodes.find(n =>
        n.id !== draggedNode.id && Math.hypot(n.x - draggedNode.x, n.y - draggedNode.y) < 10
    );

    if (overlappingNode?.id !== previouslyOverlappingNodeId) {
        svg.selectAll(".node")
            .filter(d => d.id === previouslyOverlappingNodeId)
            .classed("highlighted", false);

        if (overlappingNode) {
            svg.selectAll(".node")
                .filter(d => d.id === overlappingNode.id)
                .classed("highlighted", true);
        }

        previouslyOverlappingNodeId = overlappingNode?.id || null;
    }

    return overlappingNode;
}

function NodeMatrixOverlap(node) {
    const sim = appState.sim;
    const nodes = sim.nodes();

    for (const [matrixId, matrixNodeIds] of Object.entries(appState.matrixGroups)) {
        const dummyNode = nodes.find(n => n.id === `dummy-${matrixId}`);
        const size = matrixNodeIds.length;
        const width = size * cellSize;
        const height = size * cellSize;

        const minX = dummyNode.x;
        const maxX = dummyNode.x + width;
        const minY = dummyNode.y;
        const maxY = dummyNode.y + height;

        const isInside = node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY;

        const matrixGroup = svg.selectAll(".matrix")
            .filter(function () {
                return d3.select(this).attr("data-matrix-id") === matrixId;
            });

        if (isInside) {
            matrixGroup.classed("matrixHighlighted", true);
            return { isInside, matrixId };
        } else {
            matrixGroup.classed("matrixHighlighted", false);
        }
    }

    return { isInside: false, matrixId: null };
}
