import { buildMatrix } from './building/matrix-builder.js';
import { buildNL } from './building/NL-builder.js';
import { applyForceLayout } from './building/force-layout.js';
import { svg, appState } from './main.js';
import { applyBinaryColouring } from './multivariate/EdgeTypes.js';

//Build everything when called upon
export function buildEverything() {
    const graph = appState.graph;
    const matrixGroups = appState.matrixGroups;

    if (!graph || !matrixGroups) {
        console.warn("Graph or matrixGroups not initialized in appState.");
        return;
    }

    svg.selectAll("*").remove();

    const sim = appState.sim;
    if (sim) {
        sim.stop();
        sim.nodes([]);
        sim.force("link", null);
        sim.force("charge", null);
        sim.force("center", null);
        sim.force("collide", null);
    }

    // Reordering Phase
    const reorderedmatrixGroups = {};
    for (const [matrixId, nodesInMatrix] of Object.entries(matrixGroups)) {
        const reorderedNodes = spectralReorderMatrix(nodesInMatrix);
        reorderedmatrixGroups[matrixId] = reorderedNodes;
    }

    // Optional: Save reordered groups back to appState if needed elsewhere
    appState.matrixGroups = reorderedmatrixGroups;

    const { dummyNodes, dummyMap } = buildMatrix();
    const { nodes, links } = buildNL();

    dummyNodesToNL(nodes, links, dummyNodes);

    applyForceLayout(nodes, links, dummyMap);

    if (document.getElementById("edge-binary-color-toggle").checked) {
        applyBinaryColouring();
    }
}

//Set simulation states
export function setSimulationState({ alphaTarget, velocityDecay, chargeStrength, linkDistance }) {
    const sim = appState.sim;
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
function dummyNodesToNL(nodes, links, dummyNodes){
    graph = appState.graph
    const reorderedMatrixGroups = appState.matrixGroups

    dummyNodes.forEach(dummy => {
        const matrixId = dummy.matrixId;
        const matrixNodeIds = reorderedMatrixGroups[matrixId];
    
        for (const nlNode of nodes) {
            for (const matrixNodeId of matrixNodeIds) {
                if (graph.hasEdge(matrixNodeId, nlNode.id) || graph.hasEdge(nlNode.id, matrixNodeId)) {
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

export function spectralReorderMatrix(nodesInMatrix) {
    graph = appState.graph

    // Only reorder if the checkbox is checked
    const binaryReorderCheckbox = document.getElementById("reorder-matrices-checkbox");
    let binaryReorder = false
    if (binaryReorderCheckbox){
        binaryReorder = binaryReorderCheckbox.checked;
    }

    const n = nodesInMatrix.length;
    const adjMatrix = Array.from({ length: n }, () => Array(n).fill(0));
    let hasEdges = false;

    // Fill adjacency matrix with unweighted binary presence
    if (binaryReorder){
        nodesInMatrix.forEach((rowId, i) => {
            nodesInMatrix.forEach((colId, j) => {
                if (graph.hasEdge(rowId, colId) || graph.hasEdge(colId, rowId)) {
                    let edgeWeight = 1;
                    let attributes = null
                    // Iterate over all edges between rowId and colId (in case of multi-edges)
                    const entries = [...graph.edgeEntries(rowId, colId)];
                    if (entries.length > 0) {
                        attributes = entries[0].attributes;
                        if (attributes.codeshare === "Y"){
                            edgeWeight = 2                  
                        }
                    }

                    adjMatrix[i][j] = edgeWeight;
                    adjMatrix[j][i] = edgeWeight;  // Ensure symmetry
                    hasEdges = true;

                }
            });
        });
    }else{
        nodesInMatrix.forEach((rowId, i) => {
            nodesInMatrix.forEach((colId, j) => {
                if (graph.hasEdge(rowId, colId) || graph.hasEdge(colId, rowId)) {
                    adjMatrix[i][j] = 1;
                    hasEdges = true;
                }
            });
        });
    }

    if (!hasEdges) {
        return [...nodesInMatrix]; // No edges = no reordering
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

    return nodesInMatrix
        .map((nodeId, idx) => ({ nodeId, value: fiedlerVector[idx] }))
        .sort((a, b) => a.value - b.value)
        .map(d => d.nodeId);
}
