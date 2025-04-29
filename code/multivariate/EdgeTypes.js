export function applyBinaryColouring() {
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", d => d.attributes.codeshare === 'Y')
        .classed("CellBinaryNo", d => d.attributes.codeshare !== 'Y');

    d3.selectAll(".link")
        .each(function(d) {
            const isTrue = d.codeshare === 'Y';
            d3.select(this)
                .classed("linkBinaryYes", isTrue)
                .classed("linkBinaryNo", !isTrue);
        });
}

export function resetEdgeColors() {
    d3.selectAll(".cellPositive")
        .classed("CellBinaryYes", false)
        .classed("CellBinaryNo", false);

    d3.selectAll(".link")
        .each(function(d) {
            d3.select(this)
                .classed("linkBinaryYes", false)
                .classed("linkBinaryNo", false);
        });
}
