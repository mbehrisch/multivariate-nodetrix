//Function to provide colours to links and matrix cells for binary variables
export function applyBinaryColouring() {
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", d => d.attributes.codeshare === 'Y')
        .classed("CellBinaryNo", d => d.attributes.codeshare !== 'Y');

    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkBinaryYes", d.codeshare === 'Y')
                .classed("linkBinaryNo", d.codeshare !== 'Y');
        });
    
    //Switch button state
    buttonState.binaryVariable = true
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
    buttonState.binaryVariable = false
    buttonState.binarySorted = false
}


import { appState, buttonState } from "../main.js";

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
        const color = categoricalColorMap[d.airline];

        d3.select(this)
            .style("stroke", color)
            .style("opacity", null)
    });

    d3.selectAll(".cellPositive").each(function(d) {
        const color = categoricalColorMap[d.attributes.airline];
        d3.select(this)
            .style("fill", color)
            .style("stroke", color)
    });

    //Currently gray is used in scale --> when proper categories this is obsolete
    d3.selectAll(".cellDiagonal")
        .style("fill", "black")

    buttonState.categoricalVariable = true
}

//Function to reset back to categorical colours
export function resetCategoricalColours() {
    d3.selectAll(".link")
        .style("stroke", null)
        .style("opacity", 0.6)

    d3.selectAll(".cellPositive")
        .style("fill", "black")
        .style("stroke", "gray")

    d3.selectAll(".cellDiagonal")
        .style("fill", "#ccc")
        .style("stroke", "gray")

    buttonState.categoricalVariable = false
}

export function defineCategoricalMapping(){
    //Find the categories that are actually being visualized
    const linkCategoricals = d3.selectAll(".link").data().map(d => d.airline);
    const matrixCategoricals = d3.selectAll(".cellPositive").data().map(d => d.attributes.airline);

    // Combine the two arrays and get unique categories
    const categories = Array.from(new Set([...linkCategoricals, ...matrixCategoricals]));

    // Use appropriate color scale, when proper categories are defined this will be obsolete
    let colorScheme;
    if (categories.length <= 21) {
        colorScheme = d3.schemeCategory10.concat(d3.schemeSet3);  // 22 colors max
    } else {
        // Use a continuous scale if you have more than 22 categories
        colorScheme = d3.quantize(d3.interpolateRainbow, categories.length);
    }

    //Define the Scale
    categoricalColorScale = d3.scaleOrdinal()
        .domain(categories)
        .range(colorScheme);

    // Build color map
    categoricalColorMap = {};
    categories.forEach(category => {
        categoricalColorMap[category] = categoricalColorScale(category);
    });

    //Flip switch
    categoricalDefined = true
}