import * as d3 from 'd3';
import { appState, buttonState, datasetSpec } from "../main.js";

// ─── Categorical Dashing ──────────────────────────────────────────────────────

const CATEGORICAL_DASH_PATTERNS = [
    "none",
    "6,3",
    "2,3",
    "6,3,2,3",
    "12,4",
    "12,4,2,4",
    "4,4",
    "8,3,2,3,2,3",
    "3,2",
    "16,4",
];

// One or more SVG path-d strings per hatch style (rendered as white lines on the cell)
const CATEGORICAL_HATCH_PATH_SETS = [
    ["M0,0 l6,6"],
    ["M6,0 l-6,6"],
    ["M0,3 h6"],
    ["M3,0 v6"],
    ["M0,0 l6,6", "M0,3 l6,-6"],
    ["M0,1.5 h6", "M0,4.5 h6"],
    ["M1.5,0 v6", "M4.5,0 v6"],
    ["M0,0 l6,6", "M6,0 l-6,6"],
    ["M0,0 l3,6"],
    ["M3,0 l-3,6"],
];

export let categoricalDashMap = {};

export function applyCategoricalDashing(categoricalVar) {
    const linkCats = d3.selectAll(".link").data().map(d => d[categoricalVar]);
    const matrixCats = d3.selectAll(".cellPositive").data().map(d => d.attributes[categoricalVar]);
    const categories = Array.from(new Set([...linkCats, ...matrixCats])).filter(c => c != null);

    categoricalDashMap = {};
    categories.forEach((cat, i) => {
        categoricalDashMap[cat] = CATEGORICAL_DASH_PATTERNS[i % CATEGORICAL_DASH_PATTERNS.length];
    });

    d3.selectAll(".link").style("stroke-dasharray", d => {
        const cat = d[categoricalVar];
        return categoricalDashMap[cat] != null ? categoricalDashMap[cat] : "none";
    });

    createCategoricalHatchPatterns(categories);

    d3.selectAll(".cellPositive").each(function(d, i) {
        const cat = d.attributes[categoricalVar];
        const catIndex = categories.indexOf(cat);
        if (catIndex < 0) return;

        const patternId = `cat-hatch-${catIndex}`;
        const bbox = this.getBBox();
        const parent = d3.select(this.parentNode);
        const cellNode = this;

        const overlay = parent.append("rect")
            .attr("class", "cat-dash-overlay")
            .attr("x", bbox.x)
            .attr("y", bbox.y)
            .attr("width", bbox.width)
            .attr("height", bbox.height)
            .attr("fill", `url(#${patternId})`);

        overlay.node().parentNode.insertBefore(overlay.node(), cellNode.nextSibling);
    });

    buttonState.categoricalDash = true;
}

export function resetCategoricalDashing() {
    d3.selectAll(".link").style("stroke-dasharray", "none");
    d3.selectAll(".cat-dash-overlay").remove();
    buttonState.categoricalDash = false;
}

function createCategoricalHatchPatterns(categories) {
    let defs = d3.select("svg defs");
    if (defs.empty()) defs = d3.select("svg").insert("defs", ":first-child");

    categories.forEach((cat, i) => {
        const patternId = `cat-hatch-${i}`;
        defs.select(`#${patternId}`).remove();

        const pattern = defs.append("pattern")
            .attr("id", patternId)
            .attr("patternUnits", "userSpaceOnUse")
            .attr("width", 6)
            .attr("height", 6);

        const pathSet = CATEGORICAL_HATCH_PATH_SETS[i % CATEGORICAL_HATCH_PATH_SETS.length];
        pathSet.forEach(pathD => {
            pattern.append("path")
                .attr("d", pathD)
                .attr("stroke", "white")
                .attr("stroke-width", 1);
        });
    });
}

export function getCategoricalDashLegendEntries(categoricalVar) {
    const linkCats = d3.selectAll(".link").data().map(d => d[categoricalVar]);
    const matrixCats = d3.selectAll(".cellPositive").data().map(d => d.attributes[categoricalVar]);
    const categories = Array.from(new Set([...linkCats, ...matrixCats])).filter(c => c != null);
    return categories.map((cat, i) => ({
        label: cat,
        dashArray: CATEGORICAL_DASH_PATTERNS[i % CATEGORICAL_DASH_PATTERNS.length]
    }));
}

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

    buttonState.categoricalVariableActivated = true;
    if (buttonState.syncDirectional) buttonState.syncDirectional();
}

//Function to reset back to categorical colours
export function resetCategoricalColours() {
    d3.selectAll(".link")
        .style("stroke", null)
        .style("opacity", 0.6)

    d3.selectAll(".cellPositive")
        .style("fill", "black")
        .style("stroke", "gray")

    buttonState.categoricalVariableActivated = false;
    if (buttonState.syncDirectional) buttonState.syncDirectional();
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