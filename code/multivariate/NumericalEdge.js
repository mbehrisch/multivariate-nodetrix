import { buttonState, datasetSpec } from "../main.js";

let numericalColorScale;
let numericalDefined = false;
export let numericalColorMap = new Map();

export function applyNumericalColouring() {
    if (!numericalDefined) {
        defineNumericalMapping();
    }

    // Apply colors to links
    d3.selectAll(".link").each(function(d) {
        const value = d[datasetSpec.numericalVar];
        const color = numericalColorScale(value);

        d3.select(this)
            .style("stroke", color)
            .style("opacity", null);
    });

    d3.selectAll(".cellPositive").each(function(d) {
        const value = d.attributes[datasetSpec.numericalVar];
        const color = numericalColorScale(value);

        d3.select(this)
            .style("fill", color)
            .style("stroke", color);
    });

    buttonState.numericalVariableActivated = true;
}

export function resetNumericalColours() {
    d3.selectAll(".link")
        .style("stroke", null)
        .style("opacity", 0.6);

    d3.selectAll(".cellPositive")
        .style("fill", "black")
        .style("stroke", "gray");

    buttonState.numericalVariableActivated = false;
}

export function defineNumericalMapping() {
    const linkValues = d3.selectAll(".link").data().map(d => d[datasetSpec.numericalVar]);
    const matrixValues = d3.selectAll(".cellPositive").data().map(d => d.attributes[datasetSpec.numericalVar]);

    const allValues = [...linkValues, ...matrixValues].filter(v => v != null && !isNaN(v));

    const minValue = d3.min(allValues);
    const maxValue = d3.max(allValues);

    // You can change d3.interpolateViridis to any other sequential interpolator
    numericalColorScale = d3.scaleSequential()
        .domain([minValue, maxValue])
        //Start a little darker due to visibility
        .interpolator(t => d3.interpolateGreens(0.2 + 0.8 * t));
        //.interpolator(t => d3.interpolateYlOrRd(0.2+0.8*t)) 

    numericalDefined = true;
}
