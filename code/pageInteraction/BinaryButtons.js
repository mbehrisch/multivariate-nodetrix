import { applyBinaryColouring, resetBinaryColors, BinaryMatrices } from "../multivariate/BinaryEdge.js";
import { buildEverything, louvainMatrices } from "../utils.js";
import { appState, buttonState } from "../main.js";
import { resetCategoricalColours } from "../multivariate/CategoricalEdge.js";
import { buttonCategoricalMatrices } from "./CategoricalButtons.js";
import { resetNumericalColours } from "../multivariate/NumericalEdge.js";
import { buttonNumericalMatrices } from "./NumericalButton.js"

const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle")

export function addButtonFunctions(){
    document.getElementById("louvain-matrices-button").addEventListener("click", buttonLouvainMatrices)
    document.getElementById("binary-matrices-button").addEventListener("click", buttonBinaryMatrices)
    document.getElementById("categorical-matrices-button").addEventListener("click", buttonCategoricalMatrices)
    document.getElementById("numerical-matrices-button").addEventListener("click", buttonNumericalMatrices)
}

//Function that handles the toggling of the binatrMatrixToggle
function buttonLouvainMatrices(){
    appState.matrixGroups = louvainMatrices();
    buildEverything();
}

//Function that handles the toggling of the binatrMatrixToggle
function buttonBinaryMatrices(){
    appState.matrixGroups = BinaryMatrices();
    buildEverything();
}

//Function to make the BinaryColour Legend togglable
export function addBinaryColourLegend() {
    edgeTypeBinaryToggle.checked = false;

    //Select containers;
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

    //Add the function to the button
    edgeTypeBinaryToggle.addEventListener("change", toggleBinaryEdgeColoring);

    //Add a listener to the binary reorder button when needed
    document.getElementById("reorder-matrices-checkbox").addEventListener("change", toggleBinaryReorder);

    //Add a listener to the Binary Matrices Button

    //Toggle once at start up to reset the visualisation from previous states
    toggleBinaryEdgeColoring();
}

//Function that toggles the legend and applies/removes the colour when button is clicked
function toggleBinaryEdgeColoring() {
    const legendContainer = d3.select("#binary-variable-legend-container")
    const categoricalToggle = document.getElementById("edge-categorical-color-toggle");
    const numericalToggle = document.getElementById("edge-numerical-color-toggle")
    
    if (edgeTypeBinaryToggle.checked) {
        // Uncheck categorical if it's on, necessary for now --> prob redundant later
        if (categoricalToggle.checked) {
            categoricalToggle.checked = false;
            resetCategoricalColours();
            d3.select("#categorical-variable-legend-container").style("display", "none");
        }

        if (numericalToggle.checked) {
            numericalToggle.checked = false;
            resetNumericalColours();
            d3.select("#numerical-variable-legend-container").style("display", "none");
        }

        applyBinaryColouring();
        legendContainer.style("display", "block");
    } else {
        resetBinaryColors();
        legendContainer.style("display", "none");
    }
    
}

function toggleBinaryReorder(){
    const binaryReorderToggle = document.getElementById("reorder-matrices-checkbox")
    if (binaryReorderToggle.checked){
        buttonState.binarySorted = true
    }else{
        buttonState.binarySorted = false
    }
    buildEverything();
}