import { applyBinaryColouring, resetBinaryColors, BinaryMatrices } from "../multivariate/BinaryEdge.js";
import { buildEverything, louvainMatrices } from "../utils.js";
import { appState, buttonState } from "../main.js";
import { resetCategoricalColours } from "../multivariate/CategoricalEdge.js";

const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle")

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

    //Append button for the Binary Matrices
    const binaryMatrixItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    binaryMatrixItem.append("input")
        .attr("type", "checkbox")
        .attr("id", "binary-matrices-checkbox");

    binaryMatrixItem.append("label")
        .attr("for", "binary-matrices-checkbox")
        .text("Create Binary Matrices");

    //Add the function to the button
    edgeTypeBinaryToggle.addEventListener("change", toggleBinaryEdgeColoring);
    document.getElementById("binary-matrices-checkbox").addEventListener("change", toggleBinaryMatrices); 

    //Add a listener to the binary reorder button when needed
    document.getElementById("reorder-matrices-checkbox").addEventListener("change", toggleBinaryReorder);

    //Toggle once at start up to reset the visualisation from previous states
    toggleBinaryEdgeColoring();
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

//Function that handles the toggling of the binatrMatrixToggle
function toggleBinaryMatrices(){
    const binaryMatrixToggle = document.getElementById("binary-matrices-checkbox")
    if (binaryMatrixToggle.checked){
        appState.matrixGroups = BinaryMatrices();
        buildEverything();
    } else{
        appState.matrixGroups = louvainMatrices();
        buildEverything();
    }
}

//Function that toggles the legend and applies/removes the colour when button is clicked
function toggleBinaryEdgeColoring() {
    const legendContainer = d3.select("#binary-variable-legend-container")
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