////For a variety of node types, set colour scheme
export function applyBinaryColouring() {
    // Apply coloring to cells based on codeshare
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", d => d.attributes.codeshare === 'Y')
        .classed("CellBinaryNo", d => d.attributes.codeshare !== 'Y');

    // Apply coloring to links, preserving their original link type class
    d3.selectAll(".link")
        .each(function(d) {
            const isTrue = d.codeshare === 'Y';
            d3.select(this)
                .classed("linkBinaryYes", isTrue)
                .classed("linkBinaryNo", !isTrue)
        });
}

export function resetEdgeColors() {
    // Reset cell colors by removing the binary classes
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", false)
        .classed("CellBinaryNo", false);

    // Reset link colors by removing the binary classes, keeping the original link type
    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkBinaryYes", false)
                .classed("linkBinaryNo", false)
        });
}