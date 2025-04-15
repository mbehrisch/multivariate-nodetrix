import { svg } from './main.js';
import { getEdgeRelation } from './utils.js'; 
import { cellSize } from './main.js'; 

// Builds matrices and establishes paths for matrix-to-matrix edges
export function buildMatrix(graph, matrixGroups) {
    const matrixNodes = Object.values(matrixGroups).flat();
    const matrixDict = {};
    matrixNodes.forEach(k => matrixDict[k] = graph.getNodeAttributes(k));

    const matrixPositions = {};
    const dummyNodes = [];
    const dummyMap = {};

    let i = 0;
    const spacing = 100;

    // Phase 1: Build matrices and dummy nodes
    for (const [matrixId, nodesInMatrix] of Object.entries(matrixGroups)) {
        const size = nodesInMatrix.length;
        const x = 20 + (i % 3) * (cellSize * size + spacing * 2);
        const y = 20 + Math.floor(i / 3) * (cellSize * size + spacing * 2);
        matrixPositions[matrixId] = { x, y };
        const pos = matrixPositions[matrixId];

        // SVG group for matrix
        const matrixSvg = svg.append("g")
            .attr("transform", `translate(${pos.x},${pos.y})`)
            .attr("class", "matrix")
            .attr("data-matrix-id", matrixId);

        // Matrix rows
        const rows = matrixSvg.selectAll(".row")
            .data(nodesInMatrix)
            .enter().append("g")
            .attr("class", "row")
            .attr("transform", (d, j) => `translate(0, ${j * cellSize})`);

        // Cells in matrix
        rows.selectAll(".cell")
            .data(row => nodesInMatrix.map(col => {
                const relation = getEdgeRelation(graph, row, col);
                return { row, col, relation };
            }))
            .enter().append("rect")
            .attr("class", d => {
                if (d.row === d.col) return "cell cellDiagonal";
                return d.relation ? "cell cellPositive" : "cell cellNegative";
            })
            .attr("x", (d, i) => i * cellSize)
            .attr("width", cellSize)
            .attr("height", cellSize);

        // Column labels
        matrixSvg.selectAll(".col-label")
            .data(nodesInMatrix)
            .enter().append("text")
            .attr("class", "label col-label")
            .attr("x", (d, i) => i * cellSize + cellSize / 2)
            .attr("y", -5)
            .text(d => d);

        // Row labels
        matrixSvg.selectAll(".row-label")
            .data(nodesInMatrix)
            .enter().append("text")
            .attr("class", "label row-label")
            .attr("x", -10)
            .attr("y", (d, i) => i * cellSize + cellSize / 2)
            .attr("dy", ".35em")
            .text(d => d);

        // Store matrix position for each node (used for routing links)
        nodesInMatrix.forEach((nodeId, rowIndex) => {
            graph.setNodeAttribute(nodeId, "matrixPosNode", {
                x: pos.x,
                y: pos.y + rowIndex * cellSize + cellSize / 2
            });
            graph.setNodeAttribute(nodeId, "matrixSize", size);
        });

        // Add dummy node
        const dummyId = `dummy-${matrixId}`;
        dummyNodes.push({
            id: dummyId,
            matrixId,
            x: pos.x + (cellSize * size) / 2,
            y: pos.y + (cellSize * size) / 2,
            matrixSize: size
        });

        dummyMap[dummyId] = matrixSvg;
        i++;
    }

    // Phase 2: Build matrix-to-matrix links AFTER dummy nodes are available
    const interMatrixLinks = [];

    for (let i = 0; i < matrixNodes.length; i++) {
        for (let j = i + 1; j < matrixNodes.length; j++) {
            const source = matrixNodes[i];
            const target = matrixNodes[j];

            const sourceMatrix = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(source));
            const targetMatrix = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(target));

            if (sourceMatrix !== targetMatrix) {
                const relation = getEdgeRelation(graph, source, target);
                if (relation) {
                    interMatrixLinks.push({
                        source,
                        target,
                        relation,
                        sourceMatrix,
                        targetMatrix
                    });
                }
            }
        }
    }

    // Draw placeholder SVG paths for matrix-to-matrix links (to be positioned in ticked)
    svg.selectAll(".matrix-matrix-link")
        .data(interMatrixLinks)
        .enter()
        .append("path")
        .attr("class", "link matrix-matrix-link");

    return { dummyNodes, dummyMap };
}
