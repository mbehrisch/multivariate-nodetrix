import { svg } from "../main.js";

////For a variety of node types, set colour scheme
export function applyCodeshareColoring() {
    // Apply coloring to cells based on codeshare
    d3.selectAll(".cellPositive")
        .classed("CellCodeShareYes", d => d.attributes.codeshare === 'Y')
        .classed("CellCodeShareNo", d => d.attributes.codeshare !== 'Y');

    // Apply coloring to links, preserving their original link type class
    d3.selectAll(".link")
        .each(function(d) {
            const isCodeshare = d.codeshare === 'Y';
            d3.select(this)
                .classed("linkCodeShareYes", isCodeshare)
                .classed("linkCodeShareNo", !isCodeshare)
        });
}

export function resetEdgeColors() {
    // Reset cell colors by removing the codeshare classes
    d3.selectAll(".cellPositive")
        .classed("CellCodeShareYes", false)
        .classed("CellCodeShareNo", false);

    // Reset link colors by removing the codeshare classes, keeping the original link type
    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkCodeShareYes", false)
                .classed("linkCodeShareNo", false)
        });
}
