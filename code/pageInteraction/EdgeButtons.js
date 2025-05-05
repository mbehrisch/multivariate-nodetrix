import { applyBinaryColouring, resetBinaryColors } from "../multivariate/EdgeTypes.js";
import { buildEverything } from "../utils.js";

//Function to make the BinaryColour Legend togglable
export function addBinaryColourLegend() {
    const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle");
    edgeTypeBinaryToggle.checked = false;

    //Select containers
    const legendContainer = d3.select("#binary-variable-legend-container");
    const legend = d3.select("#binary-legend-list")

    //Append list items for Yes and No
    legend.append("li")
        .attr("class", "legend-item")
        .html('<span class="legend-color yes"></span>Yes');

    legend.append("li")
        .attr("class", "legend-item")
        .html('<span class="legend-color no"></span>No');

    //Append button for the Binary Reordering of matrices
    const reorderItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    reorderItem.append("input")
        .attr("type", "checkbox")
        .attr("id", "reorder-matrices-checkbox");

    reorderItem.append("label")
        .attr("for", "reorder-matrices-checkbox")
        .text("Sort matrices based on Binary Variable");

    
    //Function that toggles the legend and applies/removes the colour when button is clicked
    function toggleBinaryEdgeColoring() {
        const categoricalToggle = document.getElementById("edge-categorical-color-toggle");
        
        if (edgeTypeBinaryToggle.checked) {
            // Uncheck categorical if it's on, necessary for now --> prob redundant later
            if (categoricalToggle.checked) {
                categoricalToggle.checked = false;
                resetCategoricalColours();
                d3.select("#categorical-variable-legend-container").style("display", "none");
            }
    
            applyBinaryColouring();
            legendContainer.style("display", "block");
        } else {
            resetBinaryColors();
            legendContainer.style("display", "none");
        }
    }

    //Add the function to the button
    edgeTypeBinaryToggle.addEventListener("change", toggleBinaryEdgeColoring);

    //Add a listener to the binary reorder button when needed
    document.getElementById("reorder-matrices-checkbox").addEventListener("change", buildEverything);

    //Toggle once at start up to reset the visualisation from previous states
    toggleBinaryEdgeColoring();
}

import { applyCategoricalColouring, resetCategoricalColours } from "../multivariate/EdgeTypes.js";

//Function to add the CategoricalColour legend to the page, triggered upon start up
export function addCategoricalColourLegend() {
    //Find the toggle and set to false
    const categoricalToggle = document.getElementById("edge-categorical-color-toggle");
    categoricalToggle.checked = false;
    //Define container
    const legendContainer = d3.select("#categorical-variable-legend-container");

    //Define function to trigger upon toggling to create te legend or to reset upon toggling
    function toggleCategoricalColoring() {
        const binaryToggle = document.getElementById("edge-binary-color-toggle");
    
        if (categoricalToggle.checked) {
            // Uncheck binary if it's on
            if (binaryToggle.checked) {
                binaryToggle.checked = false;
                resetBinaryColors();
                d3.select("#binary-variable-legend-container").style("display", "none");
            }
    
            applyCategoricalColouring();
            renderCategoricalLegend();
            legendContainer.style("display", "block");
        } else {
            resetCategoricalColours();
            legendContainer.style("display", "none");
        }
    }

    //Add listeners
    categoricalToggle.addEventListener("change", toggleCategoricalColoring);

    //Toggle once at start up to reset the visualisation from previous states
    toggleCategoricalColoring();
}

//Import the mapping of colour to category to dynamically create the categorical mapping
import { categoricalColorMap } from "../multivariate/EdgeTypes.js";
function renderCategoricalLegend() {
    const container = d3.select("#categorical-legend-list");
    // clear existing legend
    container.selectAll("*").remove()

    //For each pairing, add an appropraite item to the list
    Object.entries(categoricalColorMap).forEach(([category, color]) => {
        const li = container.append("li")
            .attr("class", "legend-item categorical-legend-item");

        li.append("span")
            .attr("class", "legend-color")
            .style("background-color", color);  // This remains dynamic

        li.append("span").text(category);
    });
}