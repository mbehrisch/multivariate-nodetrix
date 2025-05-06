import { appState } from "../main.js";
import { buildEverything, louvainMatrices } from "../utils.js";
import { resetBinaryColors } from "../multivariate/BinaryEdge.js";
import { applyCategoricalColouring, resetCategoricalColours, CategoricalMatrices, categoricalColorMap } from "../multivariate/CategoricalEdge.js";


const categoricalToggle = document.getElementById("edge-categorical-color-toggle");

//Function to add the CategoricalColour legend to the page, triggered upon start up
export function addCategoricalColourLegend() {
    categoricalToggle.checked = false;
    const legend = d3.select("#categorical-legend-list");

    // Create a new checkbox item
    const reorderItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    categoricalToggle.addEventListener("change", toggleCategoricalColoring);

    toggleCategoricalColoring(); // Reset visual state on load
}

export function buttonCategoricalMatrices(){
    appState.matrixGroups = CategoricalMatrices();
    buildEverything();
}

// Define toggle logic
function toggleCategoricalColoring() {
    const binaryToggle = document.getElementById("edge-binary-color-toggle");
    const legendContainer = d3.select("#categorical-variable-legend-container");

    //If checked
    if (categoricalToggle.checked) {
        // Uncheck binary
        if (binaryToggle.checked) {
            binaryToggle.checked = false;
            resetBinaryColors();
            d3.select("#binary-variable-legend-container").style("display", "none");
        }
        //Apply Categorical Colouring, render the legend
        applyCategoricalColouring();
        renderCategoricalLegend();
        legendContainer.style("display", "block");
    } else {
        resetCategoricalColours();
        legendContainer.style("display", "none");
    }
}

//Import the mapping of colour to category to dynamically create the categorical mapping
function renderCategoricalLegend() {
    const container = d3.select("#categorical-legend-colors"); // updated
    container.selectAll("*").remove();

    Object.entries(categoricalColorMap).forEach(([category, color]) => {
        const li = container.append("li")
            .attr("class", "legend-item categorical-legend-item");

        li.append("span")
            .attr("class", "legend-color")
            .style("background-color", color);

        li.append("span").text(category);
    });
}