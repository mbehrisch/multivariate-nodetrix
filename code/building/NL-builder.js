import { appState, svg } from '../main.js';
import { nodeDragStarted, nodeDragged, nodeDragEnded } from '../dragging/NodeDragging.js';

// Builds nodes, establishes node-node paths and node-matrix paths
export function buildNL() {
    graph = appState.graph
    const matrixGroups = appState.matrixGroups

    // Split up nodes into a group that is going into matrix and into NL nodes
    const matrixNodes = Object.values(matrixGroups).flat();
    const nodeLinkNodes = graph.nodes().filter(k => !matrixNodes.includes(k));

    const nodeLinkDict = {};
    nodeLinkNodes.forEach(k => nodeLinkDict[k] = {
        id: k,
        ...graph.getNodeAttributes(k),
        x: 0, y: 0, vx: 0, vy: 0, r: 10
    });

    // Find links between NL nodes
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

    // Add label to nodes
    const labels = svg.selectAll(".NLlabel")
        .data(Object.values(nodeLinkDict))
        .enter().append("text")
        .attr("class", "label NLlabel")
        .attr("dy", -10)
        .text(d => graph.getNodeAttribute(d.id, 'IATA'));

    //matrixToNLLinks
    const matrixToNLLinks = [];
    graph.forEachEdge((key, attributes, source, target) => {
        if (nodeLinkSet.has(source) && !nodeLinkSet.has(target)) {
        //force-layout only accepts matrixToNLLinks where source is the matrix and target is the node --> change later
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
  
    // Place the links in the canvas, force-layout will properly update the position
    const matrixToNLLinkSelection = svg.selectAll(".matrix-NL-link")
        .data(matrixToNLLinks)
        .enter()
        .append("path")
        .attr("class", "link matrix-NL-link");

    const nodes = svg.selectAll(".node")
    .data(Object.values(nodeLinkDict))
    .enter().append("circle")
    .attr("class", "node")
    .attr("r", d => d.r)
    .call(d3.drag()
        .on("start", event => nodeDragStarted(event, matrixGroups))
        .on("drag", event => nodeDragged(event, matrixGroups))
        .on("end", event => nodeDragEnded(event, matrixGroups, graph)));

    // Update the nodes and links
    return {
        nodes: Object.values(nodeLinkDict),
        links: nodeLinkEdges,
    };
}
