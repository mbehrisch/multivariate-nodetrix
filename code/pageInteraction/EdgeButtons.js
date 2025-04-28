import { applyBinaryColouring, resetEdgeColors } from "../multivariate/EdgeTypes.js";
export function addCodeshareColourLegend(){
// Initially check the checkbox state to apply colors
    const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle");
    edgeTypeBinaryToggle.checked = false;  // Set to unchecked initially

    // Add legend container
    const legendContainer = d3.select("#multivariate-options")
        .append("div")
        .attr("id", "legend-container")
        .style("display", "none"); // Initially hidden

    // Create legend content
    const legend = legendContainer.append("ul");

    legend.append("li")
        .style("display", "flex")
        .style("align-items", "center")
        .html('<span style="width: 20px; height: 20px; background-color: green; margin-right: 10px;"></span>Yes');

    legend.append("li")
        .style("display", "flex")
        .style("align-items", "center")
        .html('<span style="width: 20px; height: 20px; background-color: red; margin-right: 10px;"></span>No');

    // Function to show/hide the legend based on checkbox state
    function toggleBinaryEdgeColoring() {
        if (edgeTypeBinaryToggle.checked) {
            applyBinaryColouring();  // Apply coloring if checked
            legendContainer.style("display", "block");  // Show the legend
        } else {
            resetEdgeColors();  // Reset to default colors if unchecked
            legendContainer.style("display", "none");  // Hide the legend
        }
    }

    // Add event listener to toggle edge colors when checkbox state changes
    edgeTypeBinaryToggle.addEventListener("change", toggleBinaryEdgeColoring);

    // Call the toggle function initially to reflect the current state of the checkbox
    toggleBinaryEdgeColoring();
}