import { svg, cellSize } from './main.js';
import { getSimulation } from "./force-layout.js";

export function nodeDragStarted(event, matrixGroups) {
    const sim = getSimulation();
    if (!event.active && sim) sim.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // Highlight the dragged node
    d3.select(event.sourceEvent.target).classed("highlighted", true);

    NodeMatrixOverlap(event.subject, matrixGroups);
}

export function nodeDragged(event, matrixGroups) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;

    // Keep highlighting the matrix if the node is over it
    NodeMatrixOverlap(event.subject, matrixGroups);
}

export function nodeDragEnded(event) {
    const sim = getSimulation();
    if (sim) sim.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;

    d3.select(this).classed("highlighted", false);
    svg.selectAll(".matrix").classed("matrixHighlighted", false);
}

function NodeMatrixOverlap(node, matrixGroups) {
    const sim = getSimulation();

    const nodes = sim.nodes();
    for (const [matrixId, matrixNodeIds] of Object.entries(matrixGroups)) {
        const dummyId = `dummy-${matrixId}`;
        const dummyNode = nodes.find(n => n.id === dummyId);


        const size = matrixNodeIds.length;
        const width = size * cellSize;
        const height = size * cellSize;

        const minX = dummyNode.x;
        const maxX = dummyNode.x + width;
        const minY = dummyNode.y;
        const maxY = dummyNode.y + height;

        const matrixGroup = svg.selectAll(".matrix")
            .filter(function () {
                return d3.select(this).attr("data-matrix-id") === matrixId;
            });

        const isInside =
            node.x >= minX &&
            node.x <= maxX &&
            node.y >= minY &&
            node.y <= maxY;

        matrixGroup.classed("matrixHighlighted", isInside);
    }
}

