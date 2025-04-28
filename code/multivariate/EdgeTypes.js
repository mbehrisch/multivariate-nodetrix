////For a variety of node types, set colour scheme
export function applyBinaryColouring() {
    // Apply coloring to cells based on codeshare
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", d => d.attributes.codeshare === 'Y')
        .classed("CellBinaryNo", d => d.attributes.codeshare !== 'Y');

    // Apply coloring to links, preserving their original link type class
    d3.selectAll(".link")
        .each(function(d) {
            const isTrue = d.codeshare === 'Y';
            d3.select(this)
                .classed("linkBinaryYes", isTrue)
                .classed("linkBinaryNo", !isTrue)
        });
}

export function resetEdgeColors() {
    // Reset cell colors by removing the binary classes
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", false)
        .classed("CellBinaryNo", false);

    // Reset link colors by removing the binary classes, keeping the original link type
    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkBinaryYes", false)
                .classed("linkBinaryNo", false)
        });
}

import numeric from 'https://cdn.skypack.dev/numeric';

export function spectralReorderMatrix(matrixGroup, graph) {
    // Create adjacency matrix for the group
    const n = matrixGroup.length;
    const adjMatrix = Array.from(Array(n), () => Array(n).fill(0));

    let hasEdges = false; // <-- Track if any edge exists

    matrixGroup.forEach((rowId, i) => {
        matrixGroup.forEach((colId, j) => {
            if (graph.hasEdge(rowId, colId)) {
                adjMatrix[i][j] = 1;
                hasEdges = true; // <-- Found at least one edge
            }
        });
    });

    if (!hasEdges) {
        // If no edges, return the original ordering
        return [...matrixGroup];
    }

    // (continue as normal)
    const degreeMatrix = adjMatrix.map((row, i) => {
        const degree = row.reduce((acc, val) => acc + val, 0);
        return row.map(() => degree);
    });

    const laplacianMatrix = numeric.add(degreeMatrix, numeric.neg(adjMatrix));
    const eigen = numeric.eig(laplacianMatrix);
    const eigenvectors = eigen.E.x;
    const fiedlerVector = eigenvectors.map(row => row[1]);

    const reorderedMatrixGroup = matrixGroup
        .map((nodeId, index) => ({ nodeId, value: fiedlerVector[index] }))
        .sort((a, b) => a.value - b.value)
        .map(item => item.nodeId);

    return reorderedMatrixGroup;
}

