import * as d3 from 'd3';
import { appState, buttonState, datasetSpec } from "../main.js";

//Function to determine the mapping of category to colour --> same colour for mental model
let categoricalColorScale;
let categoricalDefined = []
export let categoricalColorMap = {};

export function applyCategoricalColouring(categoricalVar) {
    //If we have not yet defined a categorical mapping yet, do this
    if(categoricalDefined.categoricalVar !== true){
        defineCategoricalMapping(categoricalVar);
    }

    // Apply colors to links
    d3.selectAll(".link").each(function(d) {
        const color = categoricalColorMap[d[categoricalVar]];

        d3.select(this)
            .style("stroke", color)
            .style("opacity", null)
    });

    d3.selectAll(".cellPositive").each(function(d) {
        const color = categoricalColorMap[d.attributes[categoricalVar]];
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

export function defineCategoricalMapping(categoricalVar){
    //Find the categories that are actually being visualized
    const linkCategoricals = d3.selectAll(".link").data().map(d => d[categoricalVar]);
    const matrixCategoricals = d3.selectAll(".cellPositive").data().map(d => d.attributes[categoricalVar]);

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
    categoricalDefined.categoricalVar = true
}

export function CategoricalMatrices(categoricalVar) {
    const graph = appState.graph;
    //const categoricalVar = datasetSpec.categoricalVar;

    const matrixGroups = {};

    graph.forEachNode((nodeKey) => {
        const connectedEdges = graph.edges(nodeKey); // Gets edge keys connected to this node
        const categoryCounts = {};

        connectedEdges.forEach(edgeKey => {
            const attributes = graph.getEdgeAttributes(edgeKey);
            const category = attributes[categoricalVar];

            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });

        // Find the category with the highest count
        let maxCategory = null;
        let maxCount = 0;
        for (const [category, count] of Object.entries(categoryCounts)) {
            if (count > maxCount) {
                maxCategory = category;
                maxCount = count;
            }
        }

        if (maxCategory) {
            if (!matrixGroups[maxCategory]) matrixGroups[maxCategory] = [];
            matrixGroups[maxCategory].push(nodeKey);
        }
    });

    Object.entries(matrixGroups).forEach(([category, nodesInMatrix]) =>{
        if (nodesInMatrix.length < 2){
            delete matrixGroups[category]
        }
    })

    return matrixGroups;
}