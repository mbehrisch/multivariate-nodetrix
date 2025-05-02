import { buildMatrix } from './building/matrix-builder.js';
import { buildNL } from './building/NL-builder.js';
import { applyForceLayout } from './building/force-layout.js';
import { svg, appState } from './main.js';
import { applyCategoricalColouring, applyBinaryColouring } from './multivariate/EdgeTypes.js';

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
        const reorderedNodes = hierarchicalClustering(nodesInMatrix);
        reorderedmatrixGroups[matrixId] = reorderedNodes;
    }

    // Save reordered groups back to appState if needed elsewhere
    appState.matrixGroups = reorderedmatrixGroups;

    const { dummyNodes, dummyMap } = buildMatrix();
    const { nodes, links } = buildNL();

    dummyNodesToNL(nodes, links, dummyNodes);

    applyForceLayout(nodes, links, dummyMap);

    if (document.getElementById("edge-binary-color-toggle").checked) {
        applyBinaryColouring();
    }

    if (document.getElementById("edge-categorical-color-toggle").checked) {
        applyCategoricalColouring();
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

import Clustering from 'https://cdn.skypack.dev/hdbscanjs';

export function hierarchicalClustering(nodesInMatrix) {
    const graph = appState.graph;

    const binaryReorderCheckbox = document.getElementById("reorder-matrices-checkbox");
    const binaryReorder = binaryReorderCheckbox?.checked || false;

    const n = nodesInMatrix.length;
    const adjMatrix = Array.from({ length: n }, () => Array(n).fill(0));
    let hasEdges = false;

    // Build adjacency matrix
    nodesInMatrix.forEach((rowId, i) => {
        nodesInMatrix.forEach((colId, j) => {
            //In order to give preference to the top-left, bottom-right diagonal we fill this one with 1s
            if (rowId===colId){
                adjMatrix[i][j] = 1
            }
            //Determine 
            if (graph.hasEdge(rowId, colId)) {
                let edgeWeight = 1;
                if (binaryReorder) {
                    const entries = [...graph.edgeEntries(rowId, colId)];
                    if (entries.length > 0 && entries[0].attributes.codeshare === "Y") {
                        edgeWeight = 2;
                    }
                }
                adjMatrix[i][j] = edgeWeight;
                adjMatrix[j][i] = edgeWeight;
                hasEdges = true;
            }
        });
    });

    if (!hasEdges) {
        return [...nodesInMatrix];
    }

    // Use adjacency rows as feature vectors
    const dataset = adjMatrix.map((vec, i) => ({ data: vec, opt: i }));

    // Perform clustering using Euclidean distance
    const cluster = new Clustering(dataset, Clustering.distFunc.euclidean);
    const tree = cluster.getTree();

    return tree.opt.map(index => nodesInMatrix[index])
}