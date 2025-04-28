import { svg } from '../main.js';
import { cellSize } from '../main.js'; 
import { matrixDragStarted, matrixDragged, matrixDragEnded, removeNodeFromMatrix } from '../dragging/MatrixDragging.js';

// Builds matrices and establishes paths for matrix-to-matrix edges
export function buildMatrix(graph, reorderedMatrixGroups) {
    const matrixNodes = Object.values(reorderedMatrixGroups).flat();
    const matrixDict = {};
    matrixNodes.forEach(k => matrixDict[k] = graph.getNodeAttributes(k));

    const matrixPositions = {};
    const dummyNodes = [];
    const dummyMap = {};

    let i = 0;
    const spacing = 100;

    // Build matrices (after reordering)
    for (const [matrixId, reorderedNodes] of Object.entries(reorderedMatrixGroups)) {
        const size = reorderedNodes.length;
        const x = 20 + (i % 3) * (cellSize * size + spacing * 2);
        const y = 20 + Math.floor(i / 3) * (cellSize * size + spacing * 2);
        matrixPositions[matrixId] = { x, y };
        const pos = matrixPositions[matrixId];

        // SVG group for matrix
        const matrixSvg = svg.append("g")
            .attr("transform", `translate(${pos.x},${pos.y})`)
            .attr("class", "matrix")
            .attr("data-matrix-id", matrixId)
            .call(d3.drag()
                .on("start", (event) => matrixDragStarted(event, matrixId))
                .on("drag", (event) => matrixDragged(event, matrixId))
                .on("end", (event) => matrixDragEnded(event, matrixId, graph, reorderedMatrixGroups))
            );

        //// Build actual matrix (Cells)
        const rows = matrixSvg.selectAll(".matrix-row")
            .data(reorderedNodes)
            .enter().append("g")
            .attr("class", "matrix-row")
            .attr("transform", (d, j) => `translate(0, ${j * cellSize})`);

        rows.selectAll(".cell")
            .data(function(rowId) {
                return reorderedNodes.map(colId => {
                    let attributes = null;

                    if (graph.hasEdge(rowId, colId)) {
                        const entries = [...graph.edgeEntries(rowId, colId)];
                        if (entries.length > 0) {
                            attributes = entries[0].attributes;
                        }
                    } else if (graph.hasEdge(colId, rowId)) {
                        const entries = [...graph.edgeEntries(rowId, colId)];
                        if (entries.length > 0) {
                            attributes = entries[0].attributes;
                        }
                    }

                    return { row: rowId, col: colId, attributes };
                });
            })
            .enter().append("rect")
            .attr("class", d => {
                if (d.row === d.col) return "cell cellDiagonal";
                return d.attributes ? "cell cellPositive" : "cell cellNegative";
            })
            .attr("x", (d, i) => i * cellSize)
            .attr("width", cellSize)
            .attr("height", cellSize);

        //// Row labels (for matrix)
        const labelRow = matrixSvg.append("g")
            .attr("class", "matrix-label-row")
            .attr("transform", `translate(0, ${-cellSize})`);

        const colLabelGroups = labelRow.selectAll(".label-group")
            .data(reorderedNodes)
            .enter()
            .append("g")
            .attr("class", "label-group")
            .attr("transform", (d, i) => `translate(${i * cellSize}, 0)`)
            .on("click", (event, nodeId) => {
                if (event.ctrlKey || event.metaKey) {
                    removeNodeFromMatrix(event, graph, reorderedMatrixGroups, nodeId);  // Allow removal of node on ctrl/meta-click
                }
            });

        colLabelGroups.append("rect")
            .attr("class", "cellLabel")
            .attr("width", cellSize)
            .attr("height", cellSize);

        colLabelGroups.append("text")
            .attr("class", "label label-text")
            .attr("x", cellSize / 2)
            .attr("y", cellSize / 2)
            .attr("dy", ".35em")
            .text(d => graph.getNodeAttribute(d, 'IATA'));  // Get IATA code here for the label text

        //// Column labels (for matrix)
        const labelColumn = matrixSvg.append("g")
            .attr("class", "matrix-label-column")
            .attr("transform", `translate(${-cellSize}, 0)`);

        const labelGroups = labelColumn.selectAll(".label-group")
            .data(reorderedNodes)
            .enter()
            .append("g")
            .attr("class", "label-group")
            .attr("transform", (d, i) => `translate(0, ${i * cellSize})`)
            .on("click", (event, nodeId) => {
                if (event.ctrlKey || event.metaKey) {
                    removeNodeFromMatrix(event, graph, reorderedMatrixGroups, nodeId);  // Allow removal of node on ctrl/meta-click
                }
            });

        labelGroups.append("rect")
            .attr("class", "cellLabel")
            .attr("width", cellSize)
            .attr("height", cellSize);

        labelGroups.append("text")
            .attr("class", "label label-text")
            .attr("x", cellSize / 2)
            .attr("y", cellSize / 2)
            .attr("dy", ".35em")
            .text(d => graph.getNodeAttribute(d, 'IATA'));  // Should work since d is the node ID

        // Top-left corner cell where row and column labels intersect
        matrixSvg.append("rect")
            .attr("class", "cellLabel")
            .attr("x", -cellSize)
            .attr("y", -cellSize)
            .attr("width", cellSize)
            .attr("height", cellSize);

        //// Store matrix position for each node
        reorderedNodes.forEach((nodeId, rowIndex) => {
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

    // Build matrix-to-matrix links AFTER dummy nodes are available
    const interMatrixLinks = [];

    graph.forEachEdge((edgeKey, attributes, source, target) => {
        const sourceMatrix = Object.keys(reorderedMatrixGroups).find(k => reorderedMatrixGroups[k].includes(source));
        const targetMatrix = Object.keys(reorderedMatrixGroups).find(k => reorderedMatrixGroups[k].includes(target));
      
        const isInDifferentMatrices = sourceMatrix && targetMatrix && sourceMatrix !== targetMatrix;
      
        if (isInDifferentMatrices) {
          interMatrixLinks.push({
            source,
            target,
            sourceMatrix,
            targetMatrix,
            ...attributes // Include all edge attributes like `relation`, `codeshare`, etc.
          });
        }
      });
      

    // Draw placeholder SVG paths for matrix-to-matrix links (to be positioned in ticked)
    svg.selectAll(".matrix-matrix-link")
        .data(interMatrixLinks)
        .enter()
        .append("path")
        .attr("class", "link matrix-matrix-link");

    return { dummyNodes, dummyMap };
}
