import * as d3 from 'd3';
import { appState, buttonState, datasetSpec, cellSize } from "../main.js";
import { getCustomNumericalCategories } from "../page-interaction/numerical-cat-table.js";

// export let numericalColorScale;
export let numericalColorMap = new Map();

export function applyNumericalColouring() {

    const numericalColorScale = defineNumericalMapping();
    // Apply colors to links
    d3.selectAll(".link").each(function(d) {
        const value = d[datasetSpec.numericalVar];
        let color = numericalColorScale(value);

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
    buttonState.numericalCategoriesActivated = false;
    if (buttonState.syncDirectional) buttonState.syncDirectional();
}

export function resetNumericalColours() {
    d3.selectAll(".link")
        .style("stroke", null)
        .style("opacity", 0.6);

    d3.selectAll(".cellPositive")
        .style("fill", "black")
        .style("stroke", "gray");

    buttonState.numericalVariableActivated = false;
    if (buttonState.syncDirectional) buttonState.syncDirectional();
}

export function defineNumericalMapping() {
    const linkValues = d3.selectAll(".link").data().map(d => d[datasetSpec.numericalVar]);
    const matrixValues = d3.selectAll(".cellPositive").data().map(d => d.attributes[datasetSpec.numericalVar]);

    const allValues = [...linkValues, ...matrixValues].filter(v => v != null && !isNaN(v));

    const minValue = d3.min(allValues);
    const maxValue = d3.max(allValues);

    const numericalColorScale = d3.scaleSequentialLog()
        .domain([minValue, maxValue])
        //Start a little darker due to visibility
        //.interpolator(t => d3.interpolateGreens(0.2 + 0.8 * t));
        .interpolator(t => d3.interpolateYlGnBu(0.2 + 0.8 * t))  // skip the near-white low end

    return numericalColorScale
}

let customNumericalCategories=[]

export function applyNumericalCategoriesColours(){
    customNumericalCategories.length = 0; // Clear existing
    getCustomNumericalCategories().forEach(cat => customNumericalCategories.push(cat));

    //Sort the ranges to make sense with the colours
    const sortedCategories = [...customNumericalCategories].sort((a, b) => a.range[0] - b.range[0]);

    const numCatcolorScale = d3.scaleOrdinal()
        .domain(sortedCategories.map(cat => cat.label))
        //Slice first as it is too light against white
        .range((d3.schemeYlGnBu[sortedCategories.length+1] || d3.schemeYlGnBu[9]).slice(1));

    d3.selectAll(".cellPositive").each(function(d) {
        const value = d.attributes[datasetSpec.numericalVar];
        const category = assignToCategory(value);
        let color = numCatcolorScale(category)

        if (category === "Out of Range"){
            color = "#fc0000"
        }

        d3.select(this)
            .style("fill", color)
            .style("stroke", color);
            
    });

    d3.selectAll(".link").each(function(d) {
        const value = d[datasetSpec.numericalVar];
        const category = assignToCategory(value);
        let color = numCatcolorScale(category)

        if (category === "Out of Range"){
            color = "#fc0000"
        }

        d3.select(this)
            .style("opacity", null)
            .style("stroke", color);
    });

    buttonState.numericalCategoriesActivated = true;
    if (buttonState.syncDirectional) buttonState.syncDirectional();

    return {customNumericalCategories: sortedCategories, numCatcolorScale}
}

function assignToCategory(value) {
    for (const cat of customNumericalCategories) {
        if (value >= cat.range[0] && value < cat.range[1]) {
            return cat.label;
        }
    }
    return "Out of Range";
}

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

    return matrixGroups;
}

export function applyNumericalThickness(){
    const linkValues = d3.selectAll(".link").data().map(d => d[datasetSpec.numericalVar]);
    const matrixValues = d3.selectAll(".cellPositive").data().map(d => d.attributes[datasetSpec.numericalVar]);

    const allValues = [...linkValues, ...matrixValues].filter(v => v != null && !isNaN(v));

    const minValue = d3.min(allValues);
    const maxValue = d3.max(allValues);

    const strokeWidthScale = d3.scaleLinear()
        .domain([minValue, maxValue])
        .range([3, 10]);

    d3.selectAll(".link")
        .style("stroke-width", d => {
            const val = d[datasetSpec.numericalVar];
            return strokeWidthScale(val);
        });

    const fillScale = d3.scaleLinear()
        .domain([minValue, maxValue])
        .range([0.1, 1]);    

    d3.selectAll(".cellPositive").each(function(d,i) {
        const fillRatio = fillScale(d.attributes[datasetSpec.numericalVar]);
        const innerSize = cellSize * Math.sqrt(fillRatio); // sqrt for area proportional scaling
        const offset = (cellSize - innerSize) / 2;

        const cell = d3.select(this);
        const bbox = this.getBBox();
        const parent = d3.select(this.parentNode);
        const baseColor = cell.style("fill")
        let parsedColor = null
        if (baseColor === "black"){
            parsedColor = "#606060"
        }else if (baseColor === "red"){
            parsedColor = "pink"
        }else{
            parsedColor = d3.color(baseColor).brighter(1)
        }

        // Use a unique id or data attribute to identify the overlay for this cell
        const overlayId = "thickness-overlay-" + i;
        const cellNode = this;

        // Create overlay rect with same position and size
        const overlay = parent.append("rect")
            .attr("id", overlayId)
            .attr("class", "thickness-overlay")
            .attr("x", bbox.x + offset)
            .attr("y", bbox.y + offset)
            .attr("width", innerSize)
            .attr("height", innerSize)
            .attr("fill", parsedColor.toString())

        // Move overlay in DOM to right after the cell node
        overlay.node().parentNode.insertBefore(overlay.node(), cellNode.nextSibling);
    })
}

export function resetNumericalThickness(){
    d3.selectAll(".link")
        .style("stroke-width", 1)

    d3.selectAll(".thickness-overlay").remove();
}