import * as d3 from 'd3';
import { svg, cellSize, appState, nodeSize } from '../main.js';
import { buildEverything, setSimulationState } from '../utils.js';

// Sim parameters while a drag is active: barely moving so other nodes don't shift away
const SIM_DRAG_HOLD = {
    alphaTarget: 0.005,
    velocityDecay: 0.99,
    chargeStrength: -1,
    linkDistance: 500,
};
// Sim parameters right after release, before cooling to rest
const SIM_DRAG_RELEASE = {
    alphaTarget: 0.1,
    velocityDecay: 0.6,
    chargeStrength: -50,
    linkDistance: 20,
};
const SIM_RELEASE_COOLDOWN_MS = 500;

let previouslyOverlappingNodeId = null;

export function nodeDragStarted(event) {
    // Ensure simulation is slow and active
    if (!event.active) {
        setSimulationState(SIM_DRAG_HOLD);
    }

    // Move with mouse
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // Highlight the dragged node
    const draggedNode = d3.select(event.sourceEvent.target);
    draggedNode.classed("highlighted", true);
}

export function nodeDragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;

    // Check for overlap with nodes and matrices for highlighting
    getOverlappingNodes(event.subject);
    NodeMatrixOverlap(event.subject);
}

export function nodeDragEnded(event) {
    const sim = appState.sim;  // Access simulation from appState

    if (!event.active) {
        setSimulationState(SIM_DRAG_RELEASE);
        setTimeout(() => sim.alphaTarget(0), SIM_RELEASE_COOLDOWN_MS);
    }

    // Reset dragged node position
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // Reset highlighting
    svg.selectAll(".node").classed("highlighted", false);
    svg.selectAll(".matrix").classed("matrixHighlighted", false);

    if (appState.visualizationMode === 'nodeLink') {
        return;
    }

    //Find if there is an overlapping node upon release
    const overlappingNode = getOverlappingNodes(event.subject, sim.nodes());
    if (overlappingNode) {
        //Create a new matrixId that is one bigger than the previous max
        const newMatrixId = Math.max(0, ...Object.keys(appState.matrixGroups).map(id => +id || 0)) + 1;
        //Add the nodes to the new matrix and rebuild
        appState.matrixGroups[newMatrixId] = [event.subject.id, overlappingNode.id];
        buildEverything();
        //Exit the function
        return;
    }

    //Find if there is an overlap with a matrix and with which matrix
    const { isInside, matrixId } = NodeMatrixOverlap(event.subject);
    if (isInside) {
        //Add node to matrix, rebuild and exit
        appState.matrixGroups[matrixId].push(event.subject.id);
        buildEverything();
        return;
    }
}

function getOverlappingNodes(draggedNode) {
    let overlappingNode = null;

    svg.selectAll(".node")
        .each(function (d) {
            if (d.id!==draggedNode.id){
                const isOverlapping = Math.hypot(d.x - draggedNode.x, d.y - draggedNode.y) < nodeSize;

                d3.select(this).classed("highlighted", isOverlapping);

                if (isOverlapping) {
                    overlappingNode = d;
                }
            }
        });

    return overlappingNode;
}

//Given a node, find if overlaps with a matrix
function NodeMatrixOverlap(node) {
    const sim = appState.sim;
    const nodes = sim.nodes();

    //For each matrix, find if the node is within its bounds
    for (const [matrixId, matrixNodeIds] of Object.entries(appState.matrixGroups)) {
        //Find its dummy
        const dummyNode = nodes.find(n => n.id === `dummy-${matrixId}`);
        //Determine the edges of the matrix
        const size = matrixNodeIds.length;
        const width = size * cellSize;
        const height = size * cellSize;

        const minX = dummyNode.x-cellSize;
        const maxX = dummyNode.x + width;
        const minY = dummyNode.y-cellSize;
        const maxY = dummyNode.y + height;

        //Determine if the node is inside the matrix
        const isInside = node.x >= minX && node.x <= maxX && node.y >= minY && node.y <= maxY;

        //For highlighting, retrieve the matrixSvg, if we are inside, return this info and highlighted 
        const matrixSvg = svg.selectAll(".matrix")
            .filter(function () {
                return d3.select(this).attr("matrix-id") === matrixId;
            });

        if (isInside) {
            matrixSvg.classed("matrixHighlighted", true);
            return { isInside, matrixId };
        //els de-highlight and return negative
        } else {
            matrixSvg.classed("matrixHighlighted", false);
        }
    }

    return { isInside: false, matrixId: null };
}
