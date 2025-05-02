export function applyBinaryColouring() {
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", d => d.attributes.codeshare === 'Y')
        .classed("CellBinaryNo", d => d.attributes.codeshare !== 'Y');

    d3.selectAll(".link")
        .each(function(d) {
            const isTrue = d.codeshare === 'Y';
            d3.select(this)
                .classed("linkBinaryYes", isTrue)
                .classed("linkBinaryNo", !isTrue);
        });
}

export function resetEdgeColors() {
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", false)
        .classed("CellBinaryNo", false);

    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkBinaryYes", false)
                .classed("linkBinaryNo", false);
        });
}


import { appState } from "../main.js";
let categoricalColorScale;
export let categoricalColorMap = {};

export function applyCategoricalColouring() {
    if(appState.CategoricalDefined === false){
        const linkCategoricals = d3.selectAll(".link").data().map(d => d.airline);
        const matrixCategoricals = d3.selectAll(".cellPositive").data().map(d => d.attributes.airline);
    
        // Combine the two arrays and get unique categories
        const categories = Array.from(new Set([...linkCategoricals, ...matrixCategoricals]));
    
        // Use appropriate color scale
        let colorScheme;
        if (categories.length <= 21) {
            colorScheme = d3.schemeCategory10.concat(d3.schemeSet3);  // 22 colors max
        } else {
            // Use a continuous scale if you have more than 22 categories
            colorScheme = d3.quantize(d3.interpolateRainbow, categories.length);
        }
    
        categoricalColorScale = d3.scaleOrdinal()
            .domain(categories)
            .range(colorScheme);  // Make sure this is a valid array of colors
    
        // Build color map
        categoricalColorMap = {};
        categories.forEach(category => {
            categoricalColorMap[category] = categoricalColorScale(category);
        });

        appState.CategoricalDefined = true
    }
    // Extract unique categorical names

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

    d3.selectAll(".cellDiagonal")
        .style("fill", "black")
}

export function resetCategoricalColours() {
    d3.selectAll(".link")
        .style("stroke", null)
        .style("opacity", 0.6)
        .style("stroke-width", null);
}