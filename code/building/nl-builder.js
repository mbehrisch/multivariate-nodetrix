import * as d3 from 'd3';
import { appState, datasetSpec, svg, nodeSize, tooltip } from '../main.js';
import { nodeDragStarted, nodeDragged, nodeDragEnded } from '../dragging/node-dragging.js';

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
        .call(d3.drag()
            .on("start", event => nodeDragStarted(event))
            .on("drag", event => nodeDragged(event))
            .on("end", event => nodeDragEnded(event)))
        .on("mouseover", (event, d) => showTooltip(event, d))
        .on("mousemove", (event, d) => moveTooltip(event, d))
        .on("mouseleave", () => hideTooltip())
        .on("click", (event, d) => unanchorNode(event, d.id));

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
    const nodeId = d.id;
    const label = appState.graph.getNodeAttribute(nodeId, datasetSpec.label);

    const lines = [
        `<div><strong>Node id:</strong> ${nodeId}</div>`,
        `<div><strong>Label:</strong> ${label || 'n/a'}</div>`,
        d.airport ? `<div><strong>Airport:</strong> ${d.airport}</div>` : '',
        d.city ? `<div><strong>City:</strong> ${d.city}</div>` : '',
        d.country ? `<div><strong>Country:</strong> ${d.country}</div>` : ''
    ].filter(Boolean).join('');

    tooltip
        .html(lines)
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