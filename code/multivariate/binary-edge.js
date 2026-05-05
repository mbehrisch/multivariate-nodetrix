import * as d3 from 'd3';
import { datasetSpec, buttonState, appState } from "../main.js";

// Threshold for grouping a node into the "majority-true" community
const MAJORITY_THRESHOLD = 0.5;

//Function to provide colours to links and matrix cells for binary variables
export function applyBinaryColouring() {

    // Colour matrix cells
    d3.selectAll(".cellPositive")
        .style("fill", d => d.attributes[datasetSpec.binaryVar] === true ? "green" : "red");

    // Colour links
    d3.selectAll(".link")
        .style("stroke", d => d[datasetSpec.binaryVar] === true ? "green" : "red");
    
    //Switch button state
    buttonState.binaryColour = true
}

//Reset colours
export function resetBinaryColors() {
    d3.selectAll(".cellPositive")
        .style("fill", null);

    // Reset link stroke color
    d3.selectAll(".link")
        .style("stroke", null);
    
    //Switch button state and sorted button state
    buttonState.binaryColour = false
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

        if (trueCount >= connectedEdges.length * MAJORITY_THRESHOLD) {
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

export function applyBinaryStroke() {
    d3.selectAll(".cellPositive").each(function(d, i) {
        if (d.attributes[datasetSpec.binaryVar] === true) {
            const cell = d3.select(this);
            const bbox = this.getBBox();
            const parent = d3.select(this.parentNode);

            // Use a unique id or data attribute to identify the overlay for this cell
            const overlayId = "stroke-overlay-" + i;
            const cellNode = this;

            // Create overlay rect with same position and size
            const overlay = parent.append("rect")
                .attr("id", overlayId)
                .attr("class", "stroke-overlay")
                .attr("x", bbox.x)
                .attr("y", bbox.y)
                .attr("width", bbox.width)
                .attr("height", bbox.height)
                .attr("fill", "url(#diagonalHatch)")

            // Move overlay in DOM to right after the cell node
            overlay.node().parentNode.insertBefore(overlay.node(), cellNode.nextSibling);
        }
    });

    d3.selectAll(".link")
        .style("stroke-dasharray", d => d[datasetSpec.binaryVar] === true ? "4,2" : "none");

    buttonState.binaryStroke = true;
}


export function resetBinaryStroke(){
    d3.selectAll(".link")
        .style("stroke-dasharray", "none")

    d3.selectAll(".stroke-overlay").remove();

    buttonState.binaryStroke = false
}