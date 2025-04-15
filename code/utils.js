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


import { buildMatrix } from './matrix-builder.js';
import { buildNL } from './NL-builder.js';
import { applyForceLayout } from './force-layout.js';
//Build everything when called upon
export function buildEverything (graph, matrixGroups){
    const {dummyNodes, dummyMap} = buildMatrix(graph, matrixGroups);

    //Build the Node-link diagrams
    const { nodes, links } = buildNL(graph, matrixGroups);

    //Add dummyNodes to nodes for force-layout
    dummyNodesToNL(graph, nodes, links, dummyNodes, matrixGroups)

    console.log(links)
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