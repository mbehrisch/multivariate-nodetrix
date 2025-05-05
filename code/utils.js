import { buildMatrix } from './building/matrix-builder.js';
import { buildNL } from './building/NL-builder.js';
import { applyForceLayout } from './building/force-layout.js';
import { svg, appState, buttonState, datasetSpec } from './main.js';
import { applyCategoricalColouring, applyBinaryColouring } from './multivariate/EdgeTypes.js';

//Build everything when called upon
export function buildEverything() {
    const matrixGroups = appState.matrixGroups;

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
        const {adjMatrix, hasEdges} = buildAdjacencyMatrix(nodesInMatrix);
        reorderedmatrixGroups[matrixId] = hierarchicalClustering(adjMatrix, hasEdges, nodesInMatrix);
    }

    // Save reordered groups back to appState
    appState.matrixGroups = reorderedmatrixGroups;

    //dummyNodes saves all nodes that are dummies, dummyMap maps dummyNode to matrixSVG
    const { dummyNodes, dummyMap } = buildMatrix();
    const { nodes, links } = buildNL();

    addDummyNodesFL(nodes, links, dummyNodes);

    applyForceLayout(nodes, links, dummyMap);

    if (buttonState.binaryVariableActivated) {
        applyBinaryColouring();
    }

    if (buttonState.categoricalVariableActivated) {
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
function addDummyNodesFL(nodes, links, dummyNodes){
    graph = appState.graph
    const matrixGroups = appState.matrixGroups

    dummyNodes.forEach(dummy => {
        const matrixId = dummy.matrixId;
        const matrixNodeIds = matrixGroups[matrixId];
    
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

export function buildAdjacencyMatrix(nodesInMatrix) {
    const graph = appState.graph;
    const n = nodesInMatrix.length;
    const adjMatrix = Array.from({ length: n }, () => Array(n).fill(0));
    let hasEdges = false;

    nodesInMatrix.forEach((rowId, i) => {
        nodesInMatrix.forEach((colId, j) => {
            if (rowId === colId) {
                adjMatrix[i][j] = 1; // Diagonal bias
            }

            if (graph.hasEdge(rowId, colId)) {
                let edgeWeight = 1;

                if (buttonState.binarySorted) {
                    const entries = [...graph.edgeEntries(rowId, colId)];
                    if (entries.length > 0 && entries[0].attributes[datasetSpec.binaryVar] === true) {
                        edgeWeight = 2;
                    }
                }

                adjMatrix[i][j] = edgeWeight;
                adjMatrix[j][i] = edgeWeight; // Ensure symmetry
                hasEdges = true;
            }
        });
    });

    return { adjMatrix, hasEdges };
}

import Clustering from 'https://cdn.skypack.dev/hdbscanjs';

export function hierarchicalClustering(adjMatrix, hasEdges, nodesInMatrix) {
   
    //If there are no edges in matrix, no sorting is needed
    if (!hasEdges) {
        return [...nodesInMatrix];
    }

    // Use adjacency rows as feature vectors
    const dataset = adjMatrix.map((vec, i) => ({ data: vec, opt: i }));

    // Perform clustering using Euclidean distance
    const cluster = new Clustering(dataset, Clustering.distFunc.euclidean);
    const tree = cluster.getTree();

    //Opt has the sorted row indices, reorder according to matrix
    return tree.opt.map(index => nodesInMatrix[index])
}