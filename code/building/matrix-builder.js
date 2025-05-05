import { svg , appState} from '../main.js';
import { cellSize } from '../main.js'; 
import { matrixDragStarted, matrixDragged, matrixDragEnded } from '../dragging/MatrixDragging.js';

// Builds matrices and establishes paths for matrix-to-matrix edges
export function buildMatrix() {
    const graph = appState.graph;
    const matrixGroups = appState.matrixGroups;

    const matrixNodes = Object.values(matrixGroups).flat();
    const matrixDict = {};
    matrixNodes.forEach(k => matrixDict[k] = graph.getNodeAttributes(k));

    const dummyNodes = [];
    const dummyMap = {};

    let i = 0;

    // Build matrices (after reordering)
    for (const [matrixId, nodesInMatrix] of Object.entries(matrixGroups)) {
        const matrixSize = nodesInMatrix.length;

        // SVG group for matrix
        const matrixSvg = svg.append("g")
            .attr("class", "matrix")
            .attr("matrix-id", matrixId)
            .call(d3.drag()
                .on("start", (event) => matrixDragStarted(event, matrixId))
                .on("drag", (event) => matrixDragged(event, matrixId))
                .on("end", (event) => matrixDragEnded(event, matrixId))
            );

        //// Build actual matrix (Cells)
        const rows = matrixSvg.selectAll(".matrix-row")
            .data(nodesInMatrix)
            .enter().append("g")
            .attr("class", "matrix-row")
            .attr("transform", (d, j) => `translate(0, ${j * cellSize})`);

        rows.selectAll(".cell")
            .data(function(rowId) {
                //Might be problematic if directed/multi-edge becomes important
                return nodesInMatrix.map(colId => {
                    let attributes = null;
        
                    // Check for the forward edge (rowId -> colId)
                    const forwardEdges = [...graph.edgeEntries(rowId, colId)];
                    
                    // Check for the reverse edge (colId -> rowId)
                    const backwardEdges = [...graph.edgeEntries(colId, rowId)];
                    
                    //Ensure symmetry
                    if (colId >= rowId) {
                        // For cells where colId >= rowId, use the reverse edge first
                        if (backwardEdges.length > 0) {
                            attributes = backwardEdges[0].attributes;
                        }
                    } else {
                        // Otherwise, use the forward edge
                        if (forwardEdges.length > 0) {
                            attributes = forwardEdges[0].attributes;
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
            .data(nodesInMatrix)
            .enter()
            .append("g")
            .attr("class", "label-group")
            .attr("transform", (d, i) => `translate(${i * cellSize}, 0)`)
            .on("click", (event, nodeId) => {
                if (event.ctrlKey || event.metaKey) {
                    removeNodeFromMatrix(event, nodeId);  // Allow removal of node on ctrl/meta-click
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
            .data(nodesInMatrix)
            .enter()
            .append("g")
            .attr("class", "label-group")
            .attr("transform", (d, i) => `translate(0, ${i * cellSize})`)
            .on("click", (event, nodeId) => {
                if (event.ctrlKey || event.metaKey) {
                    removeNodeFromMatrix(event, nodeId);  // Allow removal of node on ctrl/meta-click
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
            .text(d => graph.getNodeAttribute(d, 'IATA'));

        // Top-left corner cell where row and column labels intersect
        matrixSvg.append("rect")
            .attr("class", "cellLabel")
            .attr("x", -cellSize)
            .attr("y", -cellSize)
            .attr("width", cellSize)
            .attr("height", cellSize);

        // Add dummy node
        const dummyId = `dummy-${matrixId}`;
        dummyNodes.push({
            id: dummyId,
            matrixId,
            x: (cellSize * matrixSize) / 2,
            y: (cellSize * matrixSize) / 2,
            matrixSize: matrixSize
        });

        dummyMap[dummyId] = matrixSvg;
        i++;
    }

    buildInterMatrixLinks();

    return { dummyNodes, dummyMap };
}

function buildInterMatrixLinks(){
        const graph = appState.graph
        const matrixGroups = appState.matrixGroups
       // Build matrix-to-matrix links AFTER dummy nodes are available
       const interMatrixLinks = [];

       graph.forEachEdge((edgeKey, attributes, source, target) => {
           const sourceMatrix = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(source));
           const targetMatrix = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(target));
         
           const isInDifferentMatrices = sourceMatrix !== targetMatrix;
         
           if (isInDifferentMatrices) {
             interMatrixLinks.push({
               source,
               target,
               sourceMatrix,
               targetMatrix,
               ...attributes
             });
           }
         });
         
       // Draw SVG paths for matrix-to-matrix links (to be positioned in force-layout)
       svg.selectAll(".matrix-matrix-link")
           .data(interMatrixLinks)
           .enter()
           .append("path")
           .attr("class", "link matrix-matrix-link");
}

import { buildEverything } from '../utils.js';
//Function to remove NodeFromMatrix when row or column is control-clicked
function removeNodeFromMatrix (event, nodeId){
    const matrixGroups = appState.matrixGroups
    
    for (const [matrixId, nodesInMatrix] of Object.entries(matrixGroups)) {
        const index = nodesInMatrix.indexOf(nodeId);
        if (index !== -1) {
            nodesInMatrix.splice(index, 1); // Remove node from array
            // If the matrix is now 1 node,  delete it:
            if (nodesInMatrix.length === 1) {
                delete matrixGroups[matrixId];
            }
        }
    }
    appState.matrixGroups = matrixGroups;
    buildEverything()
}