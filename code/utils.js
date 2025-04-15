//Helper function that finds if two nodes have an edge in any direction
export function getEdgeRelation(graph, source, target) {
    if (graph.hasEdge(source, target)) {
        return graph.getEdgeAttribute(source, target, 'relation');
    } 
    else if (graph.hasEdge(target, source)) {
        return graph.getEdgeAttribute(target, source, 'relation');
    }
    return null;
}


import { buildMatrix } from './building/matrix-builder.js';
import { buildNL } from './building/NL-builder.js';
import { applyForceLayout } from './building/force-layout.js';
import { getSimulation } from './building/force-layout.js';

//Build everything when called upon
export function buildEverything (graph, matrixGroups){
    
    //Stop and fully clear the sim
    const sim = getSimulation();
    if (sim) {
        sim.stop(); // stops any running ticks

        // Remove previous nodes and forces
        sim.nodes([]);
        sim.force("link", null);
        sim.force("charge", null);
        sim.force("center", null);
        sim.force("collide", null);
    }

    //Start the rebuilding with the matrices
    const {dummyNodes, dummyMap} = buildMatrix(graph, matrixGroups);

    //Build the Node-link diagrams
    const { nodes, links } = buildNL(graph, matrixGroups);

    //Add dummyNodes to nodes for force-layout
    dummyNodesToNL(graph, nodes, links, dummyNodes, matrixGroups)

    //Apply force layout
    applyForceLayout(graph, nodes, links, dummyMap, matrixGroups);
}

//Local helper function to add dummyNodes to the force-layout
function dummyNodesToNL(graph, nodes, links, dummyNodes, matrixGroups){

    dummyNodes.forEach(dummy => {
        const matrixId = dummy.matrixId;
        const matrixNodeIds = matrixGroups[matrixId];
    
        for (const nlNode of nodes) {
            for (const matrixNodeId of matrixNodeIds) {
                if (getEdgeRelation(graph, matrixNodeId, nlNode.id)) {
                    links.push({
                        source: dummy.id,
                        target: nlNode.id,
                        relation: 'dummy'
                    });
                    break; // only one link needed per NL node
                }
            }
        }
    });
    
    // Add dummy nodes after link logic is done
    nodes.push(...dummyNodes);
}