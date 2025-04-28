//To do: make standard force public; or maybe do not reset upon dragging for better user impact;

import { svg, cellSize } from '../main.js';
import { getSimulation } from "../building/force-layout.js";
import { buildEverything } from '../utils.js';

export function matrixDragStarted(event, draggedMatrixId) {
    d3.select(this).raise(); // bring to front
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

    // Always highlight the dragged matrix if overlapping
    d3.select(`.matrix[data-matrix-id="${draggedMatrixId}"]`)
    .classed("matrixHighlighted", true);
}

export function matrixDragged(event, draggedMatrixId) {
    //Find dummyNode
    const sim = getSimulation();
    const dummyNode = sim.nodes().find(n => n.id === `dummy-${draggedMatrixId}`);
    if (!dummyNode) return;

    // Move the dummy node (the true position of the matrix)
    dummyNode.fx = (dummyNode.fx ?? dummyNode.x) + event.dx;
    dummyNode.fy = (dummyNode.fy ?? dummyNode.y) + event.dy;

    // Update matrix SVG group position visually
    d3.select(this)
        .attr("transform", `translate(${dummyNode.fx}, ${dummyNode.fy})`);

    // Check and highlight overlapping matrices
    findOverlappingMatrices(draggedMatrixId);
}

export function matrixDragEnded(event, draggedMatrixId, graph, reorderedMatrixGroups) {
    //Find dummynode
    const sim = getSimulation();
    const nodes = sim.nodes();
    const dummy = nodes.find(n => n.id === `dummy-${draggedMatrixId}`);
    if (!dummy) return;

    //Make matrix moveable by force-layout again
    dummy.fx = null;
    dummy.fy = null;

    //Remove all highlight of matrices
    d3.selectAll(".matrix").classed("matrixHighlighted", false);

    //Find the overlapping matrix there
    const overlappedMatrixId = findOverlappingMatrices(draggedMatrixId)
    if (overlappedMatrixId) {
        // Merge the matrices at the id of the overlapped matrix
        reorderedMatrixGroups[overlappedMatrixId] = [
            ...new Set([
                ...reorderedMatrixGroups[overlappedMatrixId],
                ...reorderedMatrixGroups[draggedMatrixId]
            ])
        ];
        //Remove the dragged Matrix
        delete reorderedMatrixGroups[draggedMatrixId];
        console.log(reorderedMatrixGroups)

        // Rebuild the full visualization
        buildEverything(graph, reorderedMatrixGroups);
        return;
    }

    // Normal simulation intensity when dragging is over, with cooldown to no movement
    if (!event.active && sim){      
        sim.velocityDecay(0.4);       
    
        const chargeForce = sim.force("charge");
        if (chargeForce) chargeForce.strength(-50);
    
        const linkForce = sim.force("link");
        if (linkForce) linkForce.distance(100);
        sim.alphaTarget(0.3).restart();
        setTimeout(() => sim.alphaTarget(0), 500);
    }
};

//Local helper function that finds any overlapping matrices
function findOverlappingMatrices(draggedId) {
    //Find dummyNode
    const sim = getSimulation();
    const nodes = sim.nodes();
    const draggedDummy = nodes.find(n => n.id === `dummy-${draggedId}`);
    if (!draggedDummy) return null;

    //Establish borders of matrix
    const draggedSize = draggedDummy.matrixSize * cellSize;
    const draggedBox = {
        minX: draggedDummy.fx ?? draggedDummy.x,
        minY: draggedDummy.fy ?? draggedDummy.y,
        maxX: (draggedDummy.fx ?? draggedDummy.x) + draggedSize,
        maxY: (draggedDummy.fy ?? draggedDummy.y) + draggedSize
    };

    //Initialise
    let foundOverlapId = null;

    //Loop over all matrices
    d3.selectAll(".matrix").each(function () {
        const matrix = d3.select(this);
        const id = matrix.attr("data-matrix-id");
        const dummy = nodes.find(n => n.id === `dummy-${id}`);

        //Skip draggedMatri
        if (!dummy || id === draggedId) return;

        //Find the size of the other matrix
        const size = dummy.matrixSize * cellSize;
        const matrixBox = {
            minX: dummy.fx ?? dummy.x,
            minY: dummy.fy ?? dummy.y,
            maxX: (dummy.fx ?? dummy.x) + size,
            maxY: (dummy.fy ?? dummy.y) + size
        };

        //Determine if overlap
        const overlap =
            draggedBox.minX < matrixBox.maxX &&
            draggedBox.maxX > matrixBox.minX &&
            draggedBox.minY < matrixBox.maxY &&
            draggedBox.maxY > matrixBox.minY;
        
        //Update matrixHighlight based on if there is overlap or not
        matrix.classed("matrixHighlighted", overlap);

        if (overlap && !foundOverlapId) {
            foundOverlapId = id;
        }
    });

    //Return the id of the overlapping matrix
    return foundOverlapId;
}

//Function to remove NodeFromMatrix when row or column is control-clicked
export function removeNodeFromMatrix (event, graph, reorderedMatrixGroups, nodeId){
    for (const [matrixId, nodes] of Object.entries(reorderedMatrixGroups)) {
        const nodeIdStr = String(nodeId);
        const index = nodes.indexOf(nodeIdStr);
        if (index !== -1) {
            nodes.splice(index, 1); // Remove node from array
            // If the matrix is now empty, optionally delete it:
            if (nodes.length === 1) {
                delete reorderedMatrixGroups[matrixId];
            }
        }
    }
    buildEverything(graph, reorderedMatrixGroups)
}

