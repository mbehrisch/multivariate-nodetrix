import { buildMatrix } from './building/matrix-builder.js';
import { buildNL } from './building/NL-builder.js';
import { applyForceLayout } from './building/force-layout.js';
import { getSimulation } from './building/force-layout.js';
import { svg } from './main.js';
import { applyBinaryColouring } from './multivariate/EdgeTypes.js';
import { currentGraph, currentMatrixGroups } from './main.js';

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

    // Reordering Phase: Reorder matrices first
    const reorderedmatrixGroups = {};
    for (const [matrixId, nodesInMatrix] of Object.entries(matrixGroups)) {
        // Perform the reordering of nodes in the matrix using spectralReorderMatrix
        const reorderedNodes = spectralReorderMatrix(nodesInMatrix, graph);
        reorderedmatrixGroups[matrixId] = reorderedNodes;
    }

    //Start the rebuilding with the matrices
    const {dummyNodes, dummyMap} = buildMatrix(graph, reorderedmatrixGroups);

    //Build the Node-link diagrams
    const { nodes, links } = buildNL(graph, reorderedmatrixGroups);

    //Add dummyNodes to nodes for force-layout
    dummyNodesToNL(graph, nodes, links, dummyNodes, reorderedmatrixGroups)

    //Apply force layout
    applyForceLayout(graph, nodes, links, dummyMap, reorderedmatrixGroups);

    //Check button settings
    if (document.getElementById("edge-binary-color-toggle").checked){
        applyBinaryColouring()
    }
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
function dummyNodesToNL(graph, nodes, links, dummyNodes, reorderedMatrixGroups){

    dummyNodes.forEach(dummy => {
        const matrixId = dummy.matrixId;
        const matrixNodeIds = reorderedMatrixGroups[matrixId];
    
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

import numeric from 'https://cdn.skypack.dev/numeric';

export function spectralReorderMatrix(matrixGroup, graph) {
    // Only reorder if the checkbox is checked
    const reorderCheckbox = document.getElementById("reorder-matrices-checkbox");
    const shouldReorder = reorderCheckbox?.checked;

    if (!shouldReorder) {
        return [...matrixGroup];  // Skip reordering
    }

    const n = matrixGroup.length;
    const adjMatrix = Array.from({ length: n }, () => Array(n).fill(0));
    let hasEdges = false;

    // Fill adjacency matrix with unweighted binary presence
    matrixGroup.forEach((rowId, i) => {
        matrixGroup.forEach((colId, j) => {
            if (graph.hasEdge(rowId, colId) || graph.hasEdge(colId, rowId)) {
                adjMatrix[i][j] = 1;
                hasEdges = true;
            }
        });
    });

    if (!hasEdges) {
        return [...matrixGroup]; // No edges = no reordering
    }

    // Degree matrix
    const degreeMatrix = adjMatrix.map(row => {
        const degree = row.reduce((acc, val) => acc + val, 0);
        return row.map(() => degree);
    });

    // Laplacian = Degree - Adjacency
    const laplacian = numeric.add(degreeMatrix, numeric.neg(adjMatrix));
    const eigen = numeric.eig(laplacian);
    const fiedlerVector = eigen.E.x.map(row => row[1]);

    return matrixGroup
        .map((nodeId, idx) => ({ nodeId, value: fiedlerVector[idx] }))
        .sort((a, b) => a.value - b.value)
        .map(d => d.nodeId);
}
