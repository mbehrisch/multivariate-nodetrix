//To do: make standard force public; or maybe do not reset upon dragging for better user impact;

import { cellSize, appState } from '../main.js';
import { buildEverything } from '../utils.js';
import { setSimulationState } from '../utils.js';

export function matrixDragStarted(event, draggedMatrixId) {
    d3.select(this).raise(); // bring to front
    const sim = appState.sim;

    //As the simulation places nodes and links we need it alive, just very slowly to make it easier
    if (!event.active && sim) {
        setSimulationState({
            alphaTarget: 0.005,
            velocityDecay: 0.99,
            chargeStrength: -1,
            linkDistance: 500,
        });
    }

    // Highlight the dragged matrix if overlapping
    d3.select(`.matrix[data-matrix-id="${draggedMatrixId}"]`)
        .classed("matrixHighlighted", true);
}

export function matrixDragged(event, draggedMatrixId) {
    //Find dummyNode
    const sim = appState.sim;
    const dummyNode = sim.nodes().find(n => n.id === `dummy-${draggedMatrixId}`);

    // Move the dummy node
    dummyNode.fx = (dummyNode.fx ?? dummyNode.x) + event.dx;
    dummyNode.fy = (dummyNode.fy ?? dummyNode.y) + event.dy;

    // Update matrix SVG group position visually
    d3.select(this)
        .attr("transform", `translate(${dummyNode.fx}, ${dummyNode.fy})`);

    // Check and highlight overlapping matrices
    findOverlappingMatrices(draggedMatrixId);
}

export function matrixDragEnded(event, draggedMatrixId) {
    graph=appState.graph
    const matrixGroups = appState.matrixGroups
    //Find dummynode
    const sim = appState.sim;
    const nodes = sim.nodes();
    const dummy = nodes.find(n => n.id === `dummy-${draggedMatrixId}`);

    //Make matrix moveable by force-layout again
    dummy.fx = null;
    dummy.fy = null;

    //Remove all highlight of matrices
    d3.selectAll(".matrix").classed("matrixHighlighted", false);

    //Find the overlapping matrix
    const overlappedMatrixId = findOverlappingMatrices(draggedMatrixId)
    if (overlappedMatrixId) {
        // Merge the matrices at the id of the overlapped matrix
        matrixGroups[overlappedMatrixId] = [
            ...new Set([
                ...matrixGroups[overlappedMatrixId],
                ...matrixGroups[draggedMatrixId]
            ])
        ];
        
        //Remove the dragged Matrix from matrixGroups
        delete matrixGroups[draggedMatrixId];

        // Rebuild the full visualization
        buildEverything();
        return;
    }

    // Normal simulation intensity when dragging is over, with cooldown to no movement
    if (!event.active && sim) {
        setSimulationState({
            alphaTarget: 0.3,
            velocityDecay: 0.4,
            chargeStrength: -50,
            linkDistance: 100,
        });
    
        setTimeout(() => sim.alphaTarget(0), 500);
    }
};

//Local helper function that finds any overlapping matrices and colours accordingly
function findOverlappingMatrices(draggedId) {
    //Find dummyNode
    const sim = appState.sim;
    const nodes = sim.nodes();
    const draggedDummy = nodes.find(n => n.id === `dummy-${draggedId}`);

    //Establish borders of matrix
    const draggedSize = draggedDummy.matrixSize * cellSize;
    const draggedBox = {
        minX: draggedDummy.fx ?? draggedDummy.x,
        minY: draggedDummy.fy ?? draggedDummy.y,
        maxX: (draggedDummy.fx ?? draggedDummy.x) + draggedSize,
        maxY: (draggedDummy.fy ?? draggedDummy.y) + draggedSize
    };

    let foundOverlapId = null;
    //Loop over all matrices
    d3.selectAll(".matrix").each(function () {
        const matrix = d3.select(this);
        const id = matrix.attr("data-matrix-id");
        const dummy = nodes.find(n => n.id === `dummy-${id}`);

        //Skip draggedMatrix
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

        //For merging purpose we only want two matrices to overlap simultaneously
        if (overlap && !foundOverlapId) {
            foundOverlapId = id;
        }
    });

    //Return the id of the overlapping matrix
    return foundOverlapId;
}

