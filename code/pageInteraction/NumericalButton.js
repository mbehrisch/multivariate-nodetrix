import { appState, datasetSpec } from "../main.js";
import { buildEverything, louvainMatrices } from "../utils.js";
import { resetBinaryColors } from "../multivariate/BinaryEdge.js";
import { resetCategoricalColours } from "../multivariate/CategoricalEdge.js";
import { applyNumericalColouring, resetNumericalColours, defineNumericalMapping } from "../multivariate/NumericalEdge.js";

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

// export function buttonNumericalMatrices() {
//     // You can optionally define a matrix grouping logic for numerical values
//     buildEverything();
// }

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

// Gradient legend
function renderNumericalLegend() {
    const container = d3.select("#numerical-legend-colors");
    container.selectAll("*").remove();

    // Assumes defineNumericalMapping() has run and numericalColorScale is available
    defineNumericalMapping(); // Ensure the color scale is up to date

    const gradientId = "numerical-gradient-scale";

    // Create SVG for gradient legend
    const svg = container.append("svg")
        .attr("width", 200)
        .attr("height", 40);

    const defs = svg.append("defs");

    const gradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%")
        .attr("x2", "100%");

    // Generate color stops across 10 steps for smoothness
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        gradient.append("stop")
            .attr("offset", `${t * 100}%`)
            .attr("stop-color", d3.interpolateGreens(0.2+0.8*t));
    }

    svg.append("rect")
        .attr("x", 0)
        .attr("y", 5)
        .attr("width", 180)
        .attr("height", 15)
        .style("fill", `url(#${gradientId})`);

    // Axis labels
    const [minValue, maxValue] = d3.extent(
        d3.selectAll(".link").data().map(d => d[datasetSpec.numericalVar])
            .concat(d3.selectAll(".cellPositive").data().map(d => d.attributes[datasetSpec.numericalVar]))
    );

    svg.append("text")
        .attr("x", 0)
        .attr("y", 35)
        .attr("font-size", "10px")
        .text(minValue.toFixed(2));

    svg.append("text")
        .attr("x", 180)
        .attr("y", 35)
        .attr("font-size", "10px")
        .attr("text-anchor", "end")
        .text(maxValue.toFixed(2));
}
