import { appState, buttonState, datasetSpec } from "../main.js";

export let numericalColorScale;
let numericalDefined = false;
export let numericalColorMap = new Map();

export function applyNumericalColouring() {
    if (!numericalDefined) {
        defineNumericalMapping();
    }

    // Apply colors to links
    d3.selectAll(".link").each(function(d) {
        const value = d[datasetSpec.numericalVar];
        const color = numericalColorScale(value);

        d3.select(this)
            .style("stroke", color)
            .style("opacity", null);
    });

    d3.selectAll(".cellPositive").each(function(d) {
        const value = d.attributes[datasetSpec.numericalVar];
        const color = numericalColorScale(value);

        d3.select(this)
            .style("fill", color)
            .style("stroke", color);
    });

    buttonState.numericalVariableActivated = true;
}

export function resetNumericalColours() {
    d3.selectAll(".link")
        .style("stroke", null)
        .style("opacity", 0.6);

    d3.selectAll(".cellPositive")
        .style("fill", "black")
        .style("stroke", "gray");

    buttonState.numericalVariableActivated = false;
}

export function defineNumericalMapping() {
    const linkValues = d3.selectAll(".link").data().map(d => d[datasetSpec.numericalVar]);
    const matrixValues = d3.selectAll(".cellPositive").data().map(d => d.attributes[datasetSpec.numericalVar]);

    const allValues = [...linkValues, ...matrixValues].filter(v => v != null && !isNaN(v));

    const minValue = d3.min(allValues);
    let maxValue = d3.max(allValues);

    // You can change d3.interpolateViridis to any other sequential interpolator
    numericalColorScale = d3.scaleSequentialLog()
        .domain([minValue, maxValue])
        //Start a little darker due to visibility
        //.interpolator(t => d3.interpolateGreens(0.2 + 0.8 * t));
        .interpolator(t => d3.interpolateYlGnBu(t)) 

    numericalDefined = true;
}

import { getCustomNumericalCategories } from "../pageInteraction/NumericalCatTable.js";
let customNumericalCategories=[]

export function NumericalMatrices() {
    const graph = appState.graph;
    const numericalVar = datasetSpec.numericalVar;

    //Retrieve custom Numerical Categories from Page
    customNumericalCategories.length = 0; // Clear existing
    getCustomNumericalCategories().forEach(cat => customNumericalCategories.push(cat));

    const matrixGroups = {};

    graph.forEachNode((nodeKey) => {
        const connectedEdges = graph.edges(nodeKey);
        const categoryCounts = {};

        connectedEdges.forEach(edgeKey => {
            const val = graph.getEdgeAttribute(edgeKey, numericalVar);

            const matchedCategory = customNumericalCategories.find(cat =>
                val >= cat.range[0] && val < cat.range[1]
            );

            if (matchedCategory) {
                const label = matchedCategory.label;
                categoryCounts[label] = (categoryCounts[label] || 0) + 1;
            }
        });

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

    Object.entries(matrixGroups).forEach(([label, nodes]) => {
        if (nodes.length < 2) delete matrixGroups[label];
    });

    // Object.entries(matrixGroups).forEach(([category, nodes]) => {
    //     console.log(`Category: ${category}, Number of nodes: ${nodes.length}`);
    // });

    return matrixGroups;
}