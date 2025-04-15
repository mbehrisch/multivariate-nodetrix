//Dragging functions to enable moving, but more importantly merging

import { svg, cellSize } from './main.js';
import { getSimulation } from "./force-layout.js";
import { buildEverything } from './utils.js';

//We need this to prevent some d3 mismatch on DragEnd
let draggedNodeSelection = null;
export function getDraggedNodeSelection() {
    return draggedNodeSelection;
}

export function nodeDragStarted(event, matrixGroups) {
    //Retrieve the simulation
    const sim = getSimulation();

    //As the simulation places nodes and links we need it alive, just very slowly to make it easier
    if (!event.active && sim){
        sim.alphaTarget(0.005);           // Keep simulation technically "alive"
        sim.velocityDecay(0.99);          // Heavy damping, almost no movement
    
        const chargeForce = sim.force("charge");
        if (chargeForce) chargeForce.strength(-1); // Barely any repulsion
    
        const linkForce = sim.force("link");
        if (linkForce) linkForce.distance(500);    // Reduce pull strength
        sim.restart()
    }

    //Move with mouse
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;

    // Highlight the dragged node
    draggedNodeSelection = d3.select(event.sourceEvent.target);
    draggedNodeSelection.classed("highlighted", true);
}


export function nodeDragged(event, matrixGroups) {
    //Move with mouse
    event.subject.fx = event.x;
    event.subject.fy = event.y;

    // Keep highlighting the matrix if the node is over it
    const {isInside, matrixId} = NodeMatrixOverlap(event.subject, matrixGroups);
}


export function nodeDragEnded(event, matrixGroups, graph) {
    //Re-activate the simulation
    const sim = getSimulation();

    sim.velocityDecay(0.4);           // Restore normal damping

    const chargeForce = sim.force("charge");
    if (chargeForce) chargeForce.strength(-50); // Normal repulsion

    const linkForce = sim.force("link");
    if (linkForce) linkForce.distance(100);     // Normal tension

    //Make node movable by force-layout again
    event.subject.fx = null;
    event.subject.fy = null;

    //Retrieve which node we selected, necessary due to d3 mismatches, and make it normal again
    const selectedNode = getDraggedNodeSelection();
    selectedNode.classed("highlighted", false);

    //Make all matrices normal again
    svg.selectAll(".matrix").classed("matrixHighlighted", false);

    //Find if a node and matrix overlap, if this is the case, rebuild everything with node added to matrix
    const {isInside, matrixId} = NodeMatrixOverlap(event.subject, matrixGroups)
    if (isInside){

            // Add the node to the matrix
            matrixGroups[matrixId].push(event.subject.id); // Add the node to the matrix's list of nodes

            // Clear the entire SVG by removing all elements, inefficient but works
            svg.selectAll("*").remove();

            //Rebuild everything, inefficent but effective
            buildEverything(graph, matrixGroups)
    }

    // Normal simulation intensity when dragging is over, with cooldown to no movement
    sim.alphaTarget(0.3).restart();            
    sim.alphaTarget(0)
}


//Find if a Node and Matrix overlap
function NodeMatrixOverlap(node, matrixGroups) {
    //Find the simulation to find the dummyNode (can be more efficient --> store dummy in matrixGroups)
    const sim = getSimulation();

    const nodes = sim.nodes();
    for (const [matrixId, matrixNodeIds] of Object.entries(matrixGroups)) {
        //Retrieve dummyNode for relevant matrixposition
        const dummyId = `dummy-${matrixId}`;
        const dummyNode = nodes.find(n => n.id === dummyId);

        //Find matrixsize
        const size = matrixNodeIds.length;
        const width = size * cellSize;
        const height = size * cellSize;

        //Determine box of matrix
        const minX = dummyNode.x;
        const maxX = dummyNode.x + width;
        const minY = dummyNode.y;
        const maxY = dummyNode.y + height;

        const isInside =
            node.x >= minX &&
            node.x <= maxX &&
            node.y >= minY &&
            node.y <= maxY;

        if (isInside){ 
            //Select the matrix svg
            const matrixGroup = svg.selectAll(".matrix")
            .filter(function () {
                return d3.select(this).attr("data-matrix-id") === matrixId;
            });

            //highlight matrix
            matrixGroup.classed("matrixHighlighted", true);

            //Return status and matrixId
            return { isInside, matrixId }
        }   
    }

    // Return null if no overlap is found
    return { isInside: false, matrixId: null };
}