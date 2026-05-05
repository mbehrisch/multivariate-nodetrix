import * as d3 from 'd3';
import { appState, buttonState } from "../main.js";
import { buildEverything } from "../utils.js";
import { resetBinaryColors } from "../multivariate/binary-edge.js";
import { resetCategoricalColours } from "../multivariate/categorical-edge.js";
import { applyNumericalColouring, resetNumericalColours, defineNumericalMapping,
     NumericalMatrices, applyNumericalCategoriesColours,
    applyNumericalThickness, 
    resetNumericalThickness} from "../multivariate/numerical-edge.js";
import { createNumCatLegend } from "../page-interaction/numerical-cat-table.js";

// Grab toggle elements
const numericalToggle = document.getElementById("edge-numerical-color-toggle");

export function SetupNumericalOptions(){
    document.getElementById("numerical-options-button").addEventListener("click", toggleNumericalOptions)
    document.getElementById("numerical-options-button").checked=false
    SetupNumericalColour();
    SetUpNumericalThickness();
}

function toggleNumericalOptions(){
    const numericalOptionsButton = document.getElementById("numerical-options-button")
    if (numericalOptionsButton.checked){
        d3.select("#numerical-options-container").style("display", "block")
    }else{
        d3.select("#numerical-options-container").style("display", "none")
    }
}

const numericalThicknessButton = document.getElementById("numerical-thickness-button")
function SetUpNumericalThickness(){
    numericalThicknessButton.checked = false
    //createBinaryStrokeLegend();
    numericalThicknessButton.addEventListener("change", toggleNumericalThickness);
    toggleNumericalThickness();
}

function toggleNumericalThickness(){
    if (numericalThicknessButton.checked === true) {
        applyNumericalThickness();
    }else{
        resetNumericalThickness();
    }
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
        legendContainer.style("display", "block");
    } else {
        const numericalCategoricalToggle = document.getElementById("categorical-numerical-matrices-checkbox")
        if(numericalCategoricalToggle){
            numericalCategoricalToggle.checked = false
            d3.selectAll(".legend-color-item").remove();
        }
        resetNumericalColours();
        legendContainer.style("display", "none");
    }
}

// Function to add numerical legend setup
export function SetupNumericalColour() {
    numericalToggle.checked = false;
    const legend = d3.select("#numerical-legend-list");

    // Create a new checkbox item (if not statically in HTML)
    const reorderItem = legend.append("li")
        .attr("class", "legend-item legend-option");

    numericalToggle.addEventListener("change", toggleNumericalColoring);

    ////Numerical-Categorical button
    reorderItem.append("input")
        .attr("type", "checkbox")
        .attr("id", "categorical-numerical-matrices-checkbox");

    reorderItem.append("label")
        .attr("for", "categorical-numerical-matrices-checkbox")
        .text("Treat numerical variables as categories");

    // Hook event listener
    document.getElementById("categorical-numerical-matrices-checkbox")
        .addEventListener("change", toggleNumericalCategories);


    renderNumericalLegend();

    toggleNumericalColoring(); // Reset state on load
}

// Gradient legend for numerical variable
function renderNumericalLegend() {
    const container = d3.select("#numerical-legend-colors");

    const numericalColorScale = defineNumericalMapping(); // Ensure scale is set

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

    d3.select("#numerical-legend-colors").style("display", "block")
}

//// Numerical Categories
export function toggleNumericalCategories(){
    const numericalCategoricalToggle = document.getElementById("categorical-numerical-matrices-checkbox")
    if (numericalCategoricalToggle.checked){

        //Recreate the legend (necessary due to customizability)
        const {customNumericalCategories, numCatcolorScale} = applyNumericalCategoriesColours();
        createNumCatLegend(customNumericalCategories, numCatcolorScale);

        d3.select("#numerical-legend-colors").style("display", "none")
    }
    else{
        applyNumericalColouring();

        d3.selectAll(".legend-color-item").remove();
        d3.select("#numerical-legend-colors").style("display", "block")
    }
}

export function buttonNumericalMatrices() {
    appState.matrixGroups = NumericalMatrices();
    buildEverything();
}