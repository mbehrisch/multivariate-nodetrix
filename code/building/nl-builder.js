import * as d3 from 'd3';
import { appState, datasetSpec, svg, nodeSize, tooltip } from '../main.js';
import { nodeDragStarted, nodeDragged, nodeDragEnded } from '../dragging/node-dragging.js';

// Guards single-click (highlight) vs double-click (node selection event)
let _clickTimer = null;

// ── Visual-highlight helpers (used by the click handler below) ──

function clearAllHighlights() {
    d3.selectAll('.node--highlighted').classed('node--highlighted', false);
    // Reset inline styles set on taper polygons before removing the class,
    // so the simulation's presentation-attribute fill is restored.
    d3.selectAll('.edge--highlighted')
        .classed('edge--highlighted', false)
        .style('fill', null)
        .style('opacity', null);
    d3.selectAll('.neighbor--highlighted').classed('neighbor--highlighted', false);
}

function highlightNodeAndNeighbors(el, nodeId) {
    // Highlight the clicked node itself
    d3.select(el).classed('node--highlighted', true);

    // Walk all edges, highlight connected ones and collect neighbor IDs
    const neighborIds = new Set();
    d3.selectAll('.NLlink').each(function (d) {
        const srcId = typeof d.source === 'object' ? d.source.id : d.source;
        const tgtId = typeof d.target === 'object' ? d.target.id : d.target;

        if (srcId === nodeId || tgtId === nodeId) {
            d3.select(this).classed('edge--highlighted', true);

            // In directional-tapering mode the path is hidden; highlight the
            // taper polygon that replaced it instead.
            const taperId = d3.select(this).attr('data-taper-id');
            if (taperId) {
                // Taper polygons use fill (not stroke), so inline styles are
                // needed to beat the simulation's presentation-attribute fill.
                d3.select(`#${taperId}`)
                    .classed('edge--highlighted', true)
                    .style('fill', '#ff7f0e')
                    .style('opacity', '0.9');
            }

            neighborIds.add(srcId === nodeId ? tgtId : srcId);
        }
    });

    // Highlight all neighboring nodes
    d3.selectAll('.node').each(function (d) {
        if (d.id !== nodeId && neighborIds.has(d.id)) {
            d3.select(this).classed('neighbor--highlighted', true);
        }
    });
}

// Builds nodes, establishes node-node paths and node-matrix paths
export function buildNL() {
    const graph = appState.graph
    const matrixGroups = appState.matrixGroups

    // Split up nodes into a group that is going into matrix and into NL nodes
    const matrixNodes = Object.values(matrixGroups).flat();
    const nodeLinkNodes = graph.nodes().filter(k => !matrixNodes.includes(k));

    const nodeLinkDict = {};
    nodeLinkNodes.forEach(k => nodeLinkDict[k] = {
        id: k,
        ...graph.getNodeAttributes(k),
        x: 0, y: 0, vx: 0, vy: 0, r: nodeSize
    });

    // Collect edges between node-link nodes
    const nodeLinkSet = new Set(nodeLinkNodes);
    const nodeLinkEdges = [];
    graph.forEachEdge((key, attributes, source, target) => {
        if (nodeLinkSet.has(source) && nodeLinkSet.has(target)) {
            nodeLinkEdges.push({
                source,
                target,
                key,
                ...attributes
            });
        }
    });
    
    // Place NL links and nodes
    const links = svg.selectAll(".NLlink")
        .data(nodeLinkEdges)
        .enter().append("path")
        .attr("class", "link NLlink");

    const nodes = svg.selectAll(".node")
        .data(Object.values(nodeLinkDict))
        .enter().append("circle")
        .attr("class", "node")
        .attr("r", d => d.r)
        .call(d3.drag()
            .on("start", event => nodeDragStarted(event))
            .on("drag", event => nodeDragged(event))
            .on("end", event => nodeDragEnded(event)))
        .on("click", (event, d) => unanchorNode(event, d.id));

    const labels = svg.selectAll(".NLlabel")
        .data(Object.values(nodeLinkDict))
        .enter().append("text")
        .attr("class", "label NLlabel")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(d => graph.getNodeAttribute(d.id, datasetSpec.label));

    //matrixToNLLinks
    const matrixToNLLinks = [];
    graph.forEachEdge((key, attributes, source, target) => {
        if (nodeLinkSet.has(source) && !nodeLinkSet.has(target)) {
        //force-layout only accepts matrixToNLLinks where source is the matrix and target is the node --> might prove problematic later
            const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(target))
            matrixToNLLinks.push({
                source: target,
                target: source,
                matrix: matrixId,
                key,
                ...attributes
            });
        }else if (!nodeLinkSet.has(source) && nodeLinkSet.has(target)){
            const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(source))
            matrixToNLLinks.push({
                source: source,
                target: target,
                matrix: matrixId,
                key: key,
                ...attributes
            })
        }
    });
  
    // Place the links in the canvas, force-layout will properly update the position later
    const matrixToNLLinkSelection = svg.selectAll(".matrix-NL-link")
        .data(matrixToNLLinks)
        .enter()
        .append("path")
        .attr("class", "link matrix-NL-link");

    // Update the nodes and links
    return {
        nodes: Object.values(nodeLinkDict),
        links: nodeLinkEdges,
    };
}

export function buildNodeLinkOnly() {
    const graph = appState.graph;
    const nodeLinkDict = {};

    graph.forEachNode(nodeId => {
        nodeLinkDict[nodeId] = {
            id: nodeId,
            ...graph.getNodeAttributes(nodeId),
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            r: nodeSize
        };
    });

    const nodeLinkEdges = [];
    graph.forEachEdge((key, attributes, source, target) => {
        nodeLinkEdges.push({
            source,
            target,
            key,
            ...attributes
        });
    });

    svg.selectAll(".NLlink")
        .data(nodeLinkEdges)
        .enter().append("path")
        .attr("class", "link NLlink");

    svg.selectAll(".node")
        .data(Object.values(nodeLinkDict))
        .enter().append("circle")
        .attr("class", "node")
        .attr("r", d => d.r)
        .style("fill", "#9e9e9e")
        .call(d3.drag()
            .on("start", event => nodeDragStarted(event))
            .on("drag", event => nodeDragged(event))
            .on("end", event => nodeDragEnded(event)))
        .on("mouseover", (event, d) => showTooltip(event, d))
        .on("mousemove", (event) => moveTooltip(event))
        .on("mouseleave", () => hideTooltip())
        .on("click", (event, d) => {
            if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
            const el           = event.currentTarget;
            const wasHighlighted = d3.select(el).classed('node--highlighted');
            _clickTimer = setTimeout(() => {
                _clickTimer = null;
                if (wasHighlighted) {
                    // Second click on the same node → deselect everything
                    clearAllHighlights();
                } else {
                    // First click on this node → clear old highlights, apply new ones
                    clearAllHighlights();
                    highlightNodeAndNeighbors(el, d.id);
                }
            }, 250);
        })
        .on("dblclick", (event, d) => {
            if (_clickTimer) { clearTimeout(_clickTimer); _clickTimer = null; }
            const label = appState.graph.getNodeAttribute(d.id, datasetSpec.label);
            document.dispatchEvent(new CustomEvent('study:nodeSelected', {
                bubbles: true,
                detail: { nodeId: d.id, label }
            }));
        });

    svg.selectAll(".NLlabel")
        .data(Object.values(nodeLinkDict))
        .enter().append("text")
        .attr("class", "label NLlabel")
        .attr("x", d => d.x)
        .attr("y", d => d.y)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .text(d => graph.getNodeAttribute(d.id, datasetSpec.label));

    return {
        nodes: Object.values(nodeLinkDict),
        links: nodeLinkEdges,
    };
}

function showTooltip(event, d) {
    const label = appState.graph.getNodeAttribute(d.id, datasetSpec.label);
    tooltip
        .html(`<div><strong>${label}</strong></div>`)
        .style('left', `${event.pageX + 12}px`)
        .style('top', `${event.pageY + 12}px`)
        .style('opacity', 1);
}

function moveTooltip(event) {
    tooltip
        .style('left', `${event.pageX + 12}px`)
        .style('top', `${event.pageY + 12}px`);
}

function hideTooltip() {
    tooltip.style('opacity', 0);
}

function unanchorNode(event, nodeId){    
    if (event.shiftKey) {
        const node = appState.sim.nodes().find(n => n.id === nodeId);
        if (node) {
            node.fx = null;
            node.fy = null;

            // Optional: visual cue
            d3.select(event.currentTarget).classed("nodeAnchored", false);
        }
    }
}