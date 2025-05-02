import { applyBinaryColouring, resetEdgeColors } from "../multivariate/EdgeTypes.js";
import { buildEverything } from "../utils.js";

export function addBinaryColourLegend() {
    const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle");
    edgeTypeBinaryToggle.checked = false;

    const legendContainer = d3.select("#binary-variable-legend-container");
    const legend = legendContainer.append("ul");

    legend.append("li")
        .style("display", "flex")
        .style("align-items", "center")
        .html('<span style="width: 20px; height: 20px; background-color: green; margin-right: 10px;"></span>Yes');

    legend.append("li")
        .style("display", "flex")
        .style("align-items", "center")
        .html('<span style="width: 20px; height: 20px; background-color: red; margin-right: 10px;"></span>No');

    const reorderItem = legend.append("li")
        .style("display", "flex")
        .style("align-items", "center")
        .style("gap", "10px");

    reorderItem.append("input")
        .attr("type", "checkbox")
        .attr("id", "reorder-matrices-checkbox");

    reorderItem.append("label")
        .attr("for", "reorder-matrices-checkbox")
        .text("Reorder matrices");

    function toggleBinaryEdgeColoring() {
        if (edgeTypeBinaryToggle.checked) {
            applyBinaryColouring();
            legendContainer.style("display", "block");
        } else {
            resetEdgeColors();
            legendContainer.style("display", "none");
            document.getElementById("reorder-matrices-checkbox").checked = false;
        }
    }

    edgeTypeBinaryToggle.addEventListener("change", toggleBinaryEdgeColoring);
    edgeTypeBinaryToggle.addEventListener("change", buildEverything);

    document.getElementById("reorder-matrices-checkbox").addEventListener("change", buildEverything);

    toggleBinaryEdgeColoring();
}

import { applyCategoricalColouring, resetCategoricalColours } from "../multivariate/EdgeTypes.js";

export function addCategoricalColourLegend() {
    const toggle = document.getElementById("edge-categorical-color-toggle");
    toggle.checked = false;

    const legendContainer = d3.select("#categorical-variable-legend-container");

    function toggleCategoricalColoring() {
        if (toggle.checked) {
            applyCategoricalColouring();
            renderCategoricalLegend();
            legendContainer.style("display", "block");
        } else {
            resetCategoricalColours();
            legendContainer.style("display", "none");
        }
    }

    toggle.addEventListener("change", toggleCategoricalColoring);
    toggle.addEventListener("change", buildEverything);

    toggleCategoricalColoring(); // Call once on load
}

import { categoricalColorMap } from "../multivariate/EdgeTypes.js";
function renderCategoricalLegend() {
    const container = d3.select("#categorical-legend-list");
    container.selectAll("*").remove(); // clear existing legend

    Object.entries(categoricalColorMap).forEach(([category, color]) => {
        const li = container.append("li")
            .style("display", "flex")
            .style("align-items", "center")
            .style("margin-bottom", "4px");

        li.append("span")
            .style("width", "15px")
            .style("height", "15px")
            .style("background-color", color)
            .style("margin-right", "10px")
            .style("display", "inline-block");

        li.append("span").text(category);
    });
}