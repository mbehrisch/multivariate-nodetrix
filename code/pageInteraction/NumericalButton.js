import { appState } from "../main.js";
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