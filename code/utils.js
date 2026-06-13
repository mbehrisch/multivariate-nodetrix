import Clustering from 'hdbscanjs';
import louvain from 'graphology-communities-louvain';
import { buildMatrix } from './building/matrix-builder.js';
import { buildNL, buildNodeLinkOnly } from './building/nl-builder.js';
import { applyForceLayout } from './building/force-layout.js';
import { svg, appState, buttonState, datasetSpec } from './main.js';
import { applyBinaryColouring, applyBinaryStroke } from './multivariate/binary-edge.js';
import { applyCategoricalColouring, applyCategoricalDashing } from './multivariate/categorical-edge.js';
import { applyNumericalCategoriesColours, applyNumericalColouring } from './multivariate/numerical-edge.js';
import { applyDirectionalGradient, applyDirectionalTaper } from './multivariate/directional-edge.js';

// Deterministically map a Prolific PID to a Latin-square order (1–4).
// Hashing the PID keeps counterbalancing roughly balanced across participants
// and — crucially — stable across browser reloads (same PID → same order).
export function deriveOrder(pid) {
    const s = String(pid || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return (h % 4) + 1;
}

// Simulation parameters used after a (re)build settles
const SIM_REST = {
    alphaTarget: 0.01,
    velocityDecay: 0.3,
    chargeStrength: -50,
    linkDistance: 30,
};
const SIM_REST_COOLDOWN_MS = 1000;

// Adjacency-matrix edge weights for hierarchical clustering
const ADJ_DIAGONAL_WEIGHT = 1;
const ADJ_EDGE_WEIGHT = 1;
const ADJ_BINARY_TRUE_WEIGHT = 2;

// Diagonal-hatch SVG pattern for "true" cells
const HATCH_TILE = 6;
const HATCH_STROKE = 1;

//Build everything when called upon
export function buildEverything() {
    const matrixGroups = appState.matrixGroups;

    // Remove everything except defs
    svg.selectAll("*").remove();
    createDiagonalHatchPattern();

    const sim = appState.sim;
    if (sim) {
        sim.stop();
        sim.nodes([]);
        sim.force("link", null);
        sim.force("charge", null);
        sim.force("center", null);
        sim.force("collide", null);
    }

    // If the user selected node-link-only mode, render only the NL diagram.
    if (appState.visualizationMode === 'nodeLink') {
        const { nodes, links } = buildNodeLinkOnly();
        applyForceLayout(nodes, links);

        if (buttonState.binaryColour) {
            applyBinaryColouring();
        }

        if (buttonState.binaryStroke){
            applyBinaryStroke();
        }

        if (buttonState.categoricalVariableActivated) {
            applyCategoricalColouring(datasetSpec.categoricalVar);
        }

        if (buttonState.numericalVariableActivated) {
            if (buttonState.numericalCategoriesActivated){
                applyNumericalCategoriesColours();
            }else{
                applyNumericalColouring();
            }
        }

        if (buttonState.categoricalDash) {
            applyCategoricalDashing(datasetSpec.categoricalVar);
        }

        if (buttonState.directionalGradient) applyDirectionalGradient();
        if (buttonState.directionalTaper) applyDirectionalTaper();

        setSimulationState(SIM_REST);
        setTimeout(() => {
            appState.sim.alphaTarget(0);
        }, SIM_REST_COOLDOWN_MS);

        return;
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

    if (buttonState.binaryColour) {
        applyBinaryColouring();
    }

    if (buttonState.binaryStroke){
        applyBinaryStroke();
    }

    if (buttonState.categoricalVariableActivated) {
        applyCategoricalColouring(datasetSpec.categoricalVar);
    }

    if (buttonState.numericalVariableActivated) {
        if (buttonState.numericalCategoriesActivated){
            applyNumericalCategoriesColours();
        }else{
            applyNumericalColouring();
        }
    }

    if (buttonState.categoricalDash) {
        applyCategoricalDashing(datasetSpec.categoricalVar);
    }

    if (buttonState.directionalGradient) applyDirectionalGradient();
    if (buttonState.directionalTaper) applyDirectionalTaper();

    setSimulationState(SIM_REST);

    setTimeout(() => {
        appState.sim.alphaTarget(0);
    }, SIM_REST_COOLDOWN_MS);
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
    const graph = appState.graph
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
                adjMatrix[i][j] = ADJ_DIAGONAL_WEIGHT;
            }

            if (graph.hasEdge(rowId, colId)) {
                let edgeWeight = ADJ_EDGE_WEIGHT;

                if (buttonState.binarySorted) {
                    const entries = [...graph.edgeEntries(rowId, colId)];
                    if (entries.length > 0 && entries[0].attributes[datasetSpec.binaryVar] === true) {
                        edgeWeight = ADJ_BINARY_TRUE_WEIGHT;
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


export function louvainMatrices(){
    const graph = appState.graph
    
    console.log("Running Louvain on graph with", graph.order, "nodes and", graph.size, "edges.");

    // Louvain community detection
    const communities = louvain(graph);

    const matrixGroups = {};
    Object.entries(communities).forEach(([node, comm]) => {
        if (!matrixGroups[comm]) matrixGroups[comm] = [];
        matrixGroups[comm].push(node);
    });

    return matrixGroups
}

export function noMatrix(){
    const graph = appState.graph
    
    console.log("Running NO MATRIX (only NL) on graph with", graph.order, "nodes and", graph.size, "edges.");

    const matrixGroups = {};
    graph.forEachNode(node => {
        matrixGroups[node] = [node];
    });

    return matrixGroups
}

function createDiagonalHatchPattern() {
  // Check if pattern already exists to avoid duplicates
  if (svg.select("pattern#diagonalHatch").empty()) {
    svg.append("defs")
        .append("pattern")
            .attr("id", "diagonalHatch")
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", HATCH_TILE)
            .attr("height", HATCH_TILE)
        .append("path")
            .attr("d", `M0,0 l${HATCH_TILE},${HATCH_TILE}`)
            .attr("stroke", "white")
            .attr("stroke-width", HATCH_STROKE);
  }
}
