import { appState, datasetSpec } from "../main.js";
import { buildEverything } from "../utils.js";
import { resetBinaryColors } from "../multivariate/BinaryEdge.js";
import { applyCategoricalColouring, resetCategoricalColours,
     CategoricalMatrices, categoricalColorMap } from "../multivariate/CategoricalEdge.js";
import { resetNumericalColours } from "../multivariate/NumericalEdge.js";


const categoricalToggle = document.getElementById("edge-categorical-color-toggle");

// Define toggle logic
function toggleCategoricalColoring() {
    const binaryToggle = document.getElementById("edge-binary-color-toggle");
    const numericalToggle = document.getElementById("edge-numerical-color-toggle")
    const legendContainer = d3.select("#categorical-variable-legend-container");

    //If checked
    if (categoricalToggle.checked) {
        // Uncheck binary
        if (binaryToggle.checked) {
            binaryToggle.checked = false;
            resetBinaryColors();
            d3.select("#binary-variable-legend-container").style("display", "none");
        }

        if (numericalToggle.checked) {
            numericalToggle.checked = false;
            resetNumericalColours();

            d3.select("#numerical-variable-legend-container").style("display", "none");

            document.getElementById("categorical-numerical-matrices-checkbox").checked=false
            d3.selectAll(".legend-color-item").remove()
        }

        applyCategoricalColouring(datasetSpec.categoricalVar)
        legendContainer.style("display", "block");
    } else {
        resetCategoricalColours();
        legendContainer.style("display", "none");
    }
}

//Function to add the CategoricalColour legend to the page, triggered upon start up
export function SetupCategoricalColour() {
    categoricalToggle.checked = false;
    const legend = d3.select("#categorical-legend-list");

    // Create a new checkbox item
    const reorderItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    categoricalToggle.addEventListener("change", toggleCategoricalColoring);

    const container = d3.select("#categorical-legend-colors"); // updated

    //Create a mapping of category to colour and print a legend
    applyCategoricalColouring(datasetSpec.categoricalVar);
    Object.entries(categoricalColorMap).forEach(([category, color]) => {
        const li = container.append("li")
            .attr("class", "legend-item categorical-legend-item");

        li.append("span")
            .attr("class", "legend-color")
            .style("background-color", color);

        li.append("span").text(category);
    });

    toggleCategoricalColoring(); // Reset visual state on load
}

export function buttonCategoricalMatrices(){
    appState.matrixGroups = CategoricalMatrices(datasetSpec.categoricalVar);
    buildEverything();
}