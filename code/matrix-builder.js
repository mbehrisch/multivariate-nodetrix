import { svg } from './main.js';
import { getEdgeRelation } from './utils.js'; 
import { cellSize } from './main.js'; 

//Builds matrices, and establishes paths for matrix-to-matrix edges
export function buildMatrix(graph, matrixGroups){
    //Helper variables
    const matrixNodes = Object.values(matrixGroups).flat();
    const matrixDict = {};
    matrixNodes.forEach(k => matrixDict[k] = graph.getNodeAttributes(k));
    const matrixPositions = {};
    
    //Build dummy nodes for force-layout
    const dummyNodes = [];
    const dummyMap = {};

    let i=0;
    const spacing = 100;

    //For each matrix place a matrix
    for (const [matrixId, nodesInMatrix] of Object.entries(matrixGroups)) {

        //Place matrices in  3x3 grid to prevent overlap early on --> potentially replace for more intelligent start
        const size = nodesInMatrix.length;
        const x = 20 + (i % 3) * (cellSize * size + spacing * 2);
        const y = 20 + Math.floor(i / 3) * (cellSize * size + spacing * 2);
        matrixPositions[matrixId] = { x, y };
        const pos = matrixPositions[matrixId];

        //Add grouping for each matrix
        const matrixSvg = svg.append("g")
            .attr("transform", `translate(${pos.x},${pos.y})`)
            .attr("class", "matrix")
            .attr("data-matrix-id", matrixId)
            
        //Make rows
        const rows = matrixSvg.selectAll(".row")
            .data(nodesInMatrix)
            .enter().append("g")
            .attr("class", "row")
            .attr("transform", (d, j) => `translate(0, ${j * cellSize})`);

        //Add cells with color-coding based on relation type
        rows.selectAll(".cell")
            .data(row => nodesInMatrix.map(col => {
                //Find edge types within matrix
                const relation = getEdgeRelation(graph, row,col);
                return {row, col, relation}
            }))
            .enter().append("rect")
            .attr("class", d => {
                //Fill in based on relationship type
                if (d.row === d.col) return "cell cellDiagonal";
                return d.relation ? "cell cellPositive": "cell cellNegative"
            })
            .attr("x", (d, i) => i * cellSize)
            .attr("width", cellSize)
            .attr("height", cellSize)

        //Add labels
        matrixSvg.selectAll(".col-label")
            .data(nodesInMatrix)
            .enter().append("text")
            .attr("class", "label col-label")
            .attr("x", (d, i) => i * cellSize + cellSize / 2)
            .attr("y", -5)
            .text(d => d);

        matrixSvg.selectAll(".row-label")
            .data(nodesInMatrix)
            .enter().append("text")
            .attr("class", "label row-label")
            .attr("x", -10)
            .attr("y", (d, i) => i * cellSize + cellSize / 2)
            .attr("dy", ".35em")
            .text(d => d)
        
        //Store the position of the rightmost cell of each node, so we refer to these positions when we start drawing paths
        nodesInMatrix.forEach((nodeId, rowIndex) => {
            graph.setNodeAttribute(nodeId, "matrixPosNode", {
                x: pos.x,
                y: pos.y + rowIndex * cellSize + cellSize / 2
            });
            graph.setNodeAttribute(nodeId, "matrixSize", size);
        });

        //Establish matrix-to-matrix paths
        const interMatrixLinks = [];
        //Loop over each node that is in a matrix, and all other nodes in matrices (prevents double links iwth getEdgeRelation)
        for (let i = 0; i < matrixNodes.length; i++) {
            for (let j = i + 1; j < matrixNodes.length; j++) {
                const source = matrixNodes[i];
                const target = matrixNodes[j];

                //Find the groups of the two nodes
                const sourceMatrix = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(source));
                const targetMatrix = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(target));

                //If they are in different matrices and have an edge, save this
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

        //Place matrix-to-matrix paths in svg, force-layout will properly change the positions
        svg.selectAll(".matrix-matrix-link")
            .data(interMatrixLinks)
            .enter()
            .append("path")
            .attr("class", "link matrix-matrix-link")

        //Mapping of matrix svgs to dummy nodes
        dummyMap[`dummy-${matrixId}`] = matrixSvg;

        //Add the dummynode to the list of dummynodes
        const dummyId = `dummy-${matrixId}`;
        dummyNodes.push({
            id: dummyId,
            matrixId,
            x: pos.x + cellSize * matrixGroups[matrixId].length / 2,
            y: pos.y + cellSize * matrixGroups[matrixId].length / 2,
            matrixSize: size
        });


    //Next matrix/node
    i++;
    }

    //return dummy nodes
    return {dummyNodes, dummyMap};
}
