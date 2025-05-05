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
    buttonState.binarySorted = false
}


import { buttonState, datasetSpec } from "../main.js";

//Function to determine the mapping of category to colour --> same colour for mental model
let categoricalColorScale;
let categoricalDefined = false
export let categoricalColorMap = {};

export function applyCategoricalColouring() {
    //If we have not yet defined a categorical mapping yet, do this
    if(categoricalDefined === false){
        defineCategoricalMapping();
    }

    // Apply colors to links
    d3.selectAll(".link").each(function(d) {
        const color = categoricalColorMap[d[datasetSpec.categoricalVar]];

        d3.select(this)
            .style("stroke", color)
            .style("opacity", null)
    });

    d3.selectAll(".cellPositive").each(function(d) {
        const color = categoricalColorMap[d.attributes[datasetSpec.categoricalVar]];
        d3.select(this)
            .style("fill", color)
            .style("stroke", color)
    });

    buttonState.categoricalVariableActivated = true
}

//Function to reset back to categorical colours
export function resetCategoricalColours() {
    d3.selectAll(".link")
        .style("stroke", null)
        .style("opacity", 0.6)

    d3.selectAll(".cellPositive")
        .style("fill", "black")
        .style("stroke", "gray")

    buttonState.categoricalVariableActivated = false
}

export function defineCategoricalMapping(){
    //Find the categories that are actually being visualized
    const linkCategoricals = d3.selectAll(".link").data().map(d => d[datasetSpec.categoricalVar]);
    const matrixCategoricals = d3.selectAll(".cellPositive").data().map(d => d.attributes[datasetSpec.categoricalVar]);

    // Combine the two arrays and get unique categories
    const categories = Array.from(new Set([...linkCategoricals, ...matrixCategoricals]));

    // Use appropriate color scale, when proper categories are defined this will be obsolete
    let colorScheme;
    if(categories.length <= 10){
        colorScheme = d3.schemeCategory10
    }
    else if (categories.length <= 21) {
        colorScheme = d3.schemeCategory10.concat(d3.schemeSet3);  // 22 colors max
    } else {
        // Use a continuous scale if you have more than 22 categories
        colorScheme = d3.quantize(d3.interpolateRainbow, categories.length);
    }

    //Define the Scale
    categoricalColorScale = d3.scaleOrdinal()
        .domain(categories)
        .range(colorScheme);

    // Build color map for later reference
    categoricalColorMap = {};
    categories.forEach(category => {
        categoricalColorMap[category] = categoricalColorScale(category);
    });

    //Flip switch
    categoricalDefined = true
}