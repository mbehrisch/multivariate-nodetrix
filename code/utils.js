//Helper function that finds if two nodes have an edge in any direction
export function getEdgeRelation(graph, source, target) {
    //This for now only works for the latest found edge between 2 nodes!

    // Get all edges between source and target
    const edges = graph.edges(source, target);

    // If there are multiple edges, you need to choose one (e.g., the first one or based on some logic)
    if (edges.length > 0) {
        const edgeId = edges[0];  // You can modify this to select the correct edge if needed
        return graph.getEdgeAttributes(edgeId);  // Get the relation of the selected edge
    } else {
        return null;  // No edge exists between the nodes
    }
}

import { buildMatrix } from './building/matrix-builder.js';
import { buildNL } from './building/NL-builder.js';
import { applyForceLayout } from './building/force-layout.js';
import { getSimulation } from './building/force-layout.js';
import { svg } from './main.js';

//Build everything when called upon
export function buildEverything (graph, matrixGroups){
    svg.selectAll("*").remove()
    
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

//Set simulation states
export function setSimulationState({ alphaTarget, velocityDecay, chargeStrength, linkDistance }) {
    const sim = getSimulation();
    if (!sim) return;

    sim.alphaTarget(alphaTarget);
    sim.velocityDecay(velocityDecay);

    const charge = sim.force("charge");
    if (charge) charge.strength(chargeStrength);

    const link = sim.force("link");
    if (link) link.distance(linkDistance);

    sim.restart();
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