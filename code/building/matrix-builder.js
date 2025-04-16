import { svg } from '../main.js';
import { getEdgeRelation } from '../utils.js'; 
import { cellSize } from '../main.js'; 
import { matrixDragStarted, matrixDragged, matrixDragEnded, removeNodeFromMatrix } from '../dragging/MatrixDragging.js';

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

    // Build matrices
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
            .attr("data-matrix-id", matrixId)
            .call(d3.drag()
                .on("start", (event) => matrixDragStarted(event,matrixId ))
                .on("drag", (event) => matrixDragged(event, matrixId ))
                .on("end", (event) =>  matrixDragEnded(event, matrixId, graph, matrixGroups))
            );

        ////Build actual matrix
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

        ////Row labels
        //Establish all labels of a row
        const labelRow = matrixSvg.append("g")
            .attr("class", "matrix-label-row")
            .attr("transform", `translate(0, ${-cellSize})`);
        
        //Make a group for each label to contain the cell and the text and append a control-click event
        const colLabelGroups = labelRow.selectAll(".label-group")
            .data(nodesInMatrix)
            .enter()
            .append("g")
            .attr("class", "label-group")
            .attr("transform", (d, i) => `translate(${i * cellSize}, 0)`)
            .on("click", (event, nodeId) => {
                if (event.ctrlKey || event.metaKey) {
                    removeNodeFromMatrix(event, graph, matrixGroups, nodeId);
                }
            });
        
        //Make the rectangle
        colLabelGroups.append("rect")
            .attr("class", "cellLabel")
            .attr("width", cellSize)
            .attr("height", cellSize);
        
        //Make the rectangle, add the text
        colLabelGroups.append("text")
            .attr("class", "label label-text")
            .attr("x", cellSize / 2)
            .attr("y", cellSize / 2)
            .attr("dy", ".35em")
            .text(d => d);
        
        ////Do the same procedure of the column labels
        const labelColumn = matrixSvg.append("g")
            .attr("class", "matrix-label-column")
            .attr("transform", `translate(${-cellSize}, 0)`);
        
        const labelGroups = labelColumn.selectAll(".label-group")
            .data(nodesInMatrix)
            .enter()
            .append("g")
            .attr("class", "label-group")
            .attr("transform", (d, i) => `translate(0, ${i * cellSize})`)
            .on("click", (event, nodeId) => {
                if (event.ctrlKey || event.metaKey) {
                    removeNodeFromMatrix(event, graph, matrixGroups, nodeId);
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
            .text(d => d);
        

        // Top-left corner cell where row and column labels intersect
        matrixSvg.append("rect")
            .attr("class", "cellLabel")
            .attr("x", -cellSize)
            .attr("y", -cellSize)
            .attr("width", cellSize)
            .attr("height", cellSize);

        ////Now matrix is in place, do other work
        // Store matrix position for each node (used for placing links)
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

    //Build matrix-to-matrix links AFTER dummy nodes are available
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
