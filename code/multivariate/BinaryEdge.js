import { datasetSpec, buttonState, appState } from "../main.js";

//Function to provide colours to links and matrix cells for binary variables
export function applyBinaryColouring() {
    d3.selectAll(".cellPositive")
        .style("fill", null)
        .style("stroke", null);

    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", d => d.attributes[datasetSpec.binaryVar] === true)
        .classed("CellBinaryNo", d => d.attributes[datasetSpec.binaryVar] !== true);

    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkBinaryYes", d[datasetSpec.binaryVar] === true)
                .classed("linkBinaryNo", d[datasetSpec.binaryVar] !== true);
        });
    
    //Switch button state
    buttonState.binaryVariableActivated = true
}

//Reset colours
export function resetBinaryColors() {
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", false)
        .classed("CellBinaryNo", false);

    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkBinaryYes", false)
                .classed("linkBinaryNo", false);
        });
    
    //Switch button state and sorted button state
    buttonState.binaryVariableActivated = false
}
//Function to create Matrices based on if the majority of the edges of a node are true or not
export function BinaryMatrices() {
    const graph = appState.graph;
    const binaryVar = datasetSpec.binaryVar;

    const majorityTrue = [];
    const majorityFalse = [];

    graph.forEachNode((nodeKey) => {
        const connectedEdges = graph.edges(nodeKey); // Gets keys of edges connected to this node
        let trueCount = 0;

        connectedEdges.forEach(edgeKey => {
            const attributes = graph.getEdgeAttributes(edgeKey);
            if (attributes[binaryVar] === true) {
                trueCount++;
            }
        });

        if (trueCount >= connectedEdges.length / 2) { //Semi-magic variable
            majorityTrue.push(nodeKey);
        } else {
            majorityFalse.push(nodeKey);
        }
    });

    //To prevent empty matrices, only push if there is something in it
    const matrixGroups = {};
    if (majorityTrue.length > 1) matrixGroups.majorityTrue = majorityTrue;
    if (majorityFalse.length > 1) matrixGroups.majorityFalse = majorityFalse;

    return matrixGroups;
}
