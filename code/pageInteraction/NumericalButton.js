import { appState, datasetSpec } from "../main.js";
import { buildEverything } from "../utils.js";
import { resetBinaryColors } from "../multivariate/BinaryEdge.js";
import { resetCategoricalColours } from "../multivariate/CategoricalEdge.js";
import { applyNumericalColouring, resetNumericalColours, defineNumericalMapping, NumericalMatrices } from "../multivariate/NumericalEdge.js";

// Grab toggle elements
const numericalToggle = document.getElementById("edge-numerical-color-toggle");

// Function to add numerical legend setup
export function addNumericalColourLegend() {
    numericalToggle.checked = false;
    const legend = d3.select("#numerical-legend-list");

    // Create a new checkbox item (if not statically in HTML)
    const reorderItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    numericalToggle.addEventListener("change", toggleNumericalColoring);

    toggleNumericalColoring(); // Reset state on load

    //Categorical button
    reorderItem.append("input")
        .attr("type", "checkbox")
        .attr("id", "categorical-numerical-matrices-checkbox");

    reorderItem.append("label")
        .attr("for", "categorical-numerical-matrices-checkbox")
        .text("Treat numerical variables as categories");

    // Hook event listener
    document.getElementById("categorical-numerical-matrices-checkbox")
        .addEventListener("change", toggleNumericalCategories);
}

import { createNumCatLegend, getCustomNumericalCategories } from "../pageInteraction/NumericalCatTable.js";
let customNumericalCategories=[]
export function toggleNumericalCategories(){
    const numericalCategoricalToggle = document.getElementById("categorical-numerical-matrices-checkbox")
    if (numericalCategoricalToggle.checked){
        console.log("A")
        d3.select("#numerical-legend-colors").style("display", "none")
        const {customNumericalCategories, colorScale}=applyNumericalCategoriesColours();
        createNumCatLegend(customNumericalCategories, colorScale);
    }
    else{
        console.log("b")
        d3.select("#numerical-legend-colors").style("display", "block")
        d3.selectAll(".legend-color-item").remove();
        applyNumericalColouring();
    }
    //Apply it to the matrix cells and links
}

function assignToCategory(value) {
    for (const cat of customNumericalCategories) {
        if (value >= cat.range[0] && value < cat.range[1]) {
            return cat.label;
        }
    }
    return "Out of Range";
}

function applyNumericalCategoriesColours(){
    customNumericalCategories.length = 0; // Clear existing
    getCustomNumericalCategories().forEach(cat => customNumericalCategories.push(cat));

    const sortedCategories = [...customNumericalCategories].sort((a, b) => a.range[0] - b.range[0]);

    const colorScale = d3.scaleOrdinal()
        .domain(sortedCategories.map(cat => cat.label))
        //Slice first as it is too light against white
        .range((d3.schemeYlGnBu[sortedCategories.length+1] || d3.schemeYlGnBu[9]).slice(1));

    d3.selectAll(".cellPositive").each(function(d) {
        const value = d.attributes[datasetSpec.numericalVar];
        const category = assignToCategory(value);
        let color = colorScale(category)

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
        let color = colorScale(category)

        console.log(value, category, color)

        if (category === "Out of Range"){
            color = "#fc0000"
        }

        d3.select(this)
            .style("opacity", null)
            .style("stroke", color);
    });

    return {customNumericalCategories: sortedCategories, colorScale}
}

export function buttonNumericalMatrices() {
    // You can optionally define a matrix grouping logic for numerical values
    appState.matrixGroups = NumericalMatrices();
    buildEverything();
}

// Toggle logic
function toggleNumericalColoring() {
    const binaryToggle = document.getElementById("edge-binary-color-toggle");
    const categoricalToggle = document.getElementById("edge-categorical-color-toggle");
    const legendContainer = d3.select("#numerical-variable-legend-container");

    if (numericalToggle.checked) {
        // Uncheck other toggles
        if (binaryToggle.checked) {
            binaryToggle.checked = false;
            resetBinaryColors();
            d3.select("#binary-variable-legend-container").style("display", "none");
        }

        if (categoricalToggle.checked) {
            categoricalToggle.checked = false;
            resetCategoricalColours();
            d3.select("#categorical-variable-legend-container").style("display", "none");
        }

        applyNumericalColouring();
        renderNumericalLegend();
        legendContainer.style("display", "block");

    } else {
        const numericalCategoricalToggle = document.getElementById("categorical-numerical-matrices-checkbox")
        if(numericalCategoricalToggle){
            numericalCategoricalToggle.checked = false
            d3.selectAll(".legend-color-item").remove();
        }
        resetNumericalColours();
        legendContainer.style("display", "none");
    }
}

import { numericalColorScale } from "../multivariate/NumericalEdge.js";
// Gradient legend
function renderNumericalLegend() {
    const container = d3.select("#numerical-legend-colors");
    container.selectAll("*").remove();

    defineNumericalMapping(); // Ensure scale is set

    const gradientId = "numerical-gradient-scale";
    const min = numericalColorScale.domain()[0];
    const max = numericalColorScale.domain()[1];

    const svgWidth = 250;
    const svg = container.append("svg")
        .attr("width", svgWidth+15)
        .attr("height", 50);

    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%")
        .attr("x2", "100%");

    const steps = 10;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        gradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", d3.interpolateYlGnBu(t));
    }

    svg.append("rect")
        .attr("x", 0)
        .attr("y", 5)
        .attr("width", svgWidth+15)
        .attr("height", 15)
        .style("fill", `url(#${gradientId})`);

    // Add log ticks with spacing
    const logScale = d3.scaleLog().domain([min, max]).range([0, svgWidth]);
    const tickCount = 8;
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    const ticks = d3.range(tickCount).map(i =>{
        const rawTick = Math.pow(10, logMin + (i * (logMax - logMin) / (tickCount - 1)));
        return Math.round(rawTick / 100) * 100; // round to nearest 100
    });

    const formatTick = d3.format("~s");

    ticks.forEach(tick => {
        svg.append("text")
            .attr("x", logScale(tick))
            .attr("y", 38)
            .attr("font-size", "10px")
            .attr("text-anchor", "middle")
            .text(formatTick(tick));
    });
}