

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
                    if (colId === rowId){
                        adjMatrix[i][j] = 1
                    }
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
                if (colId === rowId){
                    adjMatrix[i][j] = 1
                }
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