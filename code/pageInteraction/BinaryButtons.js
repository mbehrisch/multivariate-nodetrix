import { applyBinaryColouring, resetBinaryColors, BinaryMatrices } from "../multivariate/BinaryEdge.js";
import { buildEverything, louvainMatrices } from "../utils.js";
import { appState, buttonState } from "../main.js";
import { resetCategoricalColours } from "../multivariate/CategoricalEdge.js";
import { resetNumericalColours } from "../multivariate/NumericalEdge.js";

import { buttonCategoricalMatrices } from "./CategoricalButtons.js";
import { buttonNumericalMatrices } from "./NumericalButton.js"

const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle")

//Function that toggles the legend and applies/removes the colour when button is clicked
function toggleBinaryEdgeColoring() {
    //Save somewhere
    const legendContainer = d3.select("#binary-variable-legend-container")
    const categoricalToggle = document.getElementById("edge-categorical-color-toggle");
    const numericalToggle = document.getElementById("edge-numerical-color-toggle")
    
    if (edgeTypeBinaryToggle.checked) {
        // Uncheck categorical if it's on
        if (categoricalToggle.checked) {
            categoricalToggle.checked = false;
            resetCategoricalColours();

            d3.select("#categorical-variable-legend-container").style("display", "none");
        }

        if (numericalToggle.checked) {
            numericalToggle.checked = false;
            resetNumericalColours();

            d3.select("#numerical-variable-legend-container").style("display", "none");

            document.getElementById("categorical-numerical-matrices-checkbox").checked=false
            d3.selectAll(".legend-color-item").remove()
        }

        applyBinaryColouring();
        legendContainer.style("display", "block");
    } else {
        resetBinaryColors();
        legendContainer.style("display", "none");
    }
    
}

//Function to make the togglable BinaryColour Legend 
export function SetupBinaryColour() {
    edgeTypeBinaryToggle.checked = false;

    ////Add legend
    const legend = d3.select("#binary-legend-list")

    //Append list items for Yes and No
    legend.append("li")
        .attr("class", "legend-item")
        .html('<span class="legend-color yes"></span>Yes');

    legend.append("li")
        .attr("class", "legend-item")
        .html('<span class="legend-color no"></span>No');

    ////Append button for the Binary Reordering of matrices
    const reorderItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    reorderItem.append("input")
        .attr("type", "checkbox")
        .attr("id", "reorder-matrices-checkbox");

    reorderItem.append("label")
        .attr("for", "reorder-matrices-checkbox")
        .text("Sort matrices based on Binary Variable");
    //Add a listener to the binary reorder button when needed
    document.getElementById("reorder-matrices-checkbox").addEventListener("change", toggleBinaryReorder);

    ////Add the function to the button
    edgeTypeBinaryToggle.addEventListener("change", toggleBinaryEdgeColoring);

    ////Toggle once at start up to reset the visualisation from previous states
    toggleBinaryEdgeColoring();
}

////Function for the toggling of matrices ordering keeping in mind binary edges
function toggleBinaryReorder(){
    const binaryReorderToggle = document.getElementById("reorder-matrices-checkbox")
    if (binaryReorderToggle.checked){
        buttonState.binarySorted = true
    }else{
        buttonState.binarySorted = false
    }
    buildEverything();
}

////Recreate matrix buttons
//Add the listeners to the recreate matrices once
export function addButtonFunctions(){
    document.getElementById("louvain-matrices-button").addEventListener("click", buttonLouvainMatrices)
    document.getElementById("binary-matrices-button").addEventListener("click", buttonBinaryMatrices)
    document.getElementById("categorical-matrices-button").addEventListener("click", buttonCategoricalMatrices)
    document.getElementById("numerical-matrices-button").addEventListener("click", buttonNumericalMatrices)
}

//Function that recreates the matrices using the louvain algorithm
function buttonLouvainMatrices(){
    appState.matrixGroups = louvainMatrices();
    buildEverything();
}

//Function that recreates the matrices keeping in mind the binary variable
function buttonBinaryMatrices(){
    appState.matrixGroups = BinaryMatrices();
    buildEverything();
}