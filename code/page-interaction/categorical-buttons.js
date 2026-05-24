import * as d3 from 'd3';
import { appState, datasetSpec } from "../main.js";
import { buildEverything } from "../utils.js";
import { resetBinaryColors } from "../multivariate/binary-edge.js";
import { applyCategoricalColouring, resetCategoricalColours,
     CategoricalMatrices, categoricalColorMap,
     applyCategoricalDashing, resetCategoricalDashing,
     getCategoricalDashLegendEntries } from "../multivariate/categorical-edge.js";
import { resetNumericalColours } from "../multivariate/numerical-edge.js";


const categoricalToggle = document.getElementById("edge-categorical-color-toggle");
const categoricalDashButton = document.getElementById("categorical-dash-button");

// ─── Parent expand/collapse ───────────────────────────────────────────────────

export function SetupCategoricalOptions() {
    document.getElementById("categorical-options-button")
        .addEventListener("click", toggleCategoricalOptions);
    document.getElementById("categorical-options-button").checked = false;

    SetupCategoricalColour();
    SetupCategoricalDash();
}

function toggleCategoricalOptions() {
    const btn = document.getElementById("categorical-options-button");
    d3.select("#categorical-options-container")
        .style("display", btn.checked ? "block" : "none");
}

// ─── Colour encoding ─────────────────────────────────────────────────────────

function toggleCategoricalColoring() {
    const binaryToggle = document.getElementById("edge-binary-color-toggle");
    const numericalToggle = document.getElementById("edge-numerical-color-toggle")
    const legendContainer = d3.select("#categorical-variable-legend-container");

    if (categoricalToggle.checked) {
        if (binaryToggle.checked) {
            binaryToggle.checked = false;
            resetBinaryColors();
            d3.select("#binary-variable-legend-container").style("display", "none");
        }

        if (numericalToggle.checked) {
            numericalToggle.checked = false;
            resetNumericalColours();
            d3.select("#numerical-variable-legend-container").style("display", "none");
            document.getElementById("categorical-numerical-matrices-checkbox").checked = false;
            d3.selectAll(".legend-color-item").remove();
        }

        applyCategoricalColouring(datasetSpec.categoricalVar);
        legendContainer.style("display", "block");
    } else {
        resetCategoricalColours();
        legendContainer.style("display", "none");
    }
}

export function SetupCategoricalColour() {
    categoricalToggle.checked = false;
    const legend = d3.select("#categorical-legend-list");

    const reorderItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    categoricalToggle.addEventListener("change", toggleCategoricalColoring);

    const container = d3.select("#categorical-legend-colors");

    applyCategoricalColouring(datasetSpec.categoricalVar);
    Object.entries(categoricalColorMap).forEach(([category, color]) => {
        const li = container.append("li")
            .attr("class", "legend-item categorical-legend-item");

        li.append("span")
            .attr("class", "legend-color")
            .style("background-color", color);

        li.append("span").text(category);
    });

    toggleCategoricalColoring();
}

// ─── Dashing encoding ─────────────────────────────────────────────────────────

function SetupCategoricalDash() {
    categoricalDashButton.checked = false;
    categoricalDashButton.addEventListener("change", toggleCategoricalDashing);
    toggleCategoricalDashing();
}

function toggleCategoricalDashing() {
    const legendContainer = d3.select("#categorical-dash-legend-container");
    if (categoricalDashButton.checked) {
        applyCategoricalDashing(datasetSpec.categoricalVar);
        renderCategoricalDashLegend();
        legendContainer.style("display", "flex");
    } else {
        resetCategoricalDashing();
        legendContainer.style("display", "none");
    }
}

function renderCategoricalDashLegend() {
    const list = d3.select("#categorical-dash-list");
    list.selectAll("*").remove();

    const entries = getCategoricalDashLegendEntries(datasetSpec.categoricalVar);
    entries.forEach(({ label, dashArray }) => {
        const li = list.append("li")
            .attr("class", "legend-item");

        li.append("svg")
            .attr("width", 40)
            .attr("height", 10)
            .append("line")
                .attr("x1", 0).attr("y1", 5).attr("x2", 40).attr("y2", 5)
                .attr("stroke", "black")
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", dashArray === "none" ? null : dashArray);

        li.append("span")
            .style("margin-left", "6px")
            .text(label);
    });
}

// ─── Matrix recreation ───────────────────────────────────────────────────────

export function buttonCategoricalMatrices() {
    appState.matrixGroups = CategoricalMatrices(datasetSpec.categoricalVar);
    buildEverything();
}
