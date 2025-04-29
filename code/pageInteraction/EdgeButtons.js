import { applyBinaryColouring, resetEdgeColors } from "../multivariate/EdgeTypes.js";
import { buildEverything } from "../utils.js";

export function addBinaryColourLegend() {
    const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle");
    edgeTypeBinaryToggle.checked = false;

    const legendContainer = d3.select("#multivariate-options")
        .append("div")
        .attr("id", "legend-container")
        .style("display", "none");

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
    document.getElementById("reorder-matrices-checkbox").addEventListener("change", () => {
        buildEverything();
    });

    // Additional listener to ensure that buildEverything is called when unchecked
    document.getElementById("reorder-matrices-checkbox").addEventListener("change", () => {
        if (!document.getElementById("reorder-matrices-checkbox").checked) {
            buildEverything();  // Rebuild everything if the checkbox is unchecked
        }
    });

    toggleBinaryEdgeColoring();
}
