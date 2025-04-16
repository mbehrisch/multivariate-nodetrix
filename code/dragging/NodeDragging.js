//Dragging functions to enable moving, but more importantly merging

import { svg, cellSize } from '../main.js';
import { getSimulation } from "../building/force-layout.js";
import { buildEverything } from '../utils.js';

// //We need this to prevent some d3 mismatch on DragEnd
// let draggedNodeSelection = null;
// export function getDraggedNodeSelection() {
//     return draggedNodeSelection;
// }

let previouslyOverlappingNodeId = null;

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
    const draggedNode = d3.select(event.sourceEvent.target);
    draggedNode.classed("highlighted", true);
}


export function nodeDragged(event, matrixGroups) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;

    const sim = getSimulation();
    const allNodes = sim.nodes();

    //Check if there is overlap with nodes and highlight
    getOverlappingNodes(event.subject, allNodes);

    //Check if there is overlap with matrices and highlight
    NodeMatrixOverlap(event.subject, matrixGroups);
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

    //Make all matrices and nodes normal again
    svg.selectAll(".node").classed("highlighted", false)
    svg.selectAll(".matrix").classed("matrixHighlighted", false);

    //Find if node-node overlap, if this is the case, rebuild everything with a new 2x2 matrix
    const overlappingNode = getOverlappingNodes(event.subject, sim.nodes())
    if (overlappingNode) {
        // Find the highest MatrixId, and become 1 higher than that (prevent overwriting exisiting matrices)
        const newMatrixId = Math.max(0, ...Object.keys(matrixGroups).map(id => +id || 0)) + 1;
        // Append a matrix to the matrixGroups with the 2 nodes in it
        matrixGroups[newMatrixId] = [event.subject.id, overlappingNode.id];

        console.log(matrixGroups)

        //Rebuild everything
        buildEverything(graph, matrixGroups);

        //Stop
        return
    }
    
    //Find if a node and matrix overlap, if this is the case, rebuild everything with node added to matrix
    const {isInside, matrixId} = NodeMatrixOverlap(event.subject, matrixGroups)
    if (isInside){
            // Add the node to the matrix
            matrixGroups[matrixId].push(event.subject.id); // Add the node to the matrix's list of nodes

            //Rebuild everything, inefficent but effective
            buildEverything(graph, matrixGroups)
            //Stop
            return
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
}

function getOverlappingNodes(draggedNode, allNodes) {
    //Find if there is an overlapping node
    const overlappingNode = allNodes.find(n =>
        n.id !== draggedNode.id &&
        Math.hypot(n.x - draggedNode.x, n.y - draggedNode.y) < 10
    );

    // If overlapping with a new node --> we need to remove the highlight from the previously overlapping node
    if (overlappingNode?.id !== previouslyOverlappingNodeId) {
        // Remove highlight from previously overlapping node
        svg.selectAll(".node")
            .filter(d => d.id === previouslyOverlappingNodeId)
            .classed("highlighted", false);

        // Highlight new overlapping node
        if (overlappingNode) {
            svg.selectAll(".node")
                .filter(d => d.id === overlappingNode.id)
                .classed("highlighted", true);
        }

        // Track the new overlap
        previouslyOverlappingNodeId = overlappingNode?.id || null;
    }

    // If no overlap and one was previously highlighted
    if (!overlappingNode && previouslyOverlappingNodeId) {
        svg.selectAll(".node")
            .filter(d => d.id === previouslyOverlappingNodeId)
            .classed("highlighted", false);
        previouslyOverlappingNodeId = null;
    }

    return overlappingNode
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

        //Select the matrix svg
        const matrixGroup = svg.selectAll(".matrix")
        .filter(function () {
            return d3.select(this).attr("data-matrix-id") === matrixId;
        });

        if (isInside){ 
            //highlight matrix
            matrixGroup.classed("matrixHighlighted", true);

            //Return status and matrixId
            return { isInside, matrixId }
        } else{
            matrixGroup.classed("matrixHighlighted", false);
        }   
    }

    // Return null if no overlap is found
    return { isInside: false, matrixId: null };
}