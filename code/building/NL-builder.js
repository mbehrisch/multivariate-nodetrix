import { svg } from '../main.js';
import { getEdgeRelation } from '../utils.js';  // Keep the function name unchanged
import { nodeDragStarted, nodeDragged, nodeDragEnded } from '../dragging/NodeDragging.js';

// Builds nodes, establishes node-node paths and node-matrix paths
export function buildNL(graph, reorderedMatrixGroups) {
    // Split up nodes into a group that is going into matrix and into NL nodes
    const matrixNodes = Object.values(reorderedMatrixGroups).flat();
    const nodeLinkNodes = graph.nodes().filter(k => !matrixNodes.includes(k));

    const nodeLinkDict = {};
    nodeLinkNodes.forEach(k => nodeLinkDict[k] = {
        id: k,
        ...graph.getNodeAttributes(k),
        x: 0, y: 0, vx: 0, vy: 0, r: 10
    });

    // Find links between NL nodes
    const nodeLinkEdges = [];
    for (let i = 0; i < nodeLinkNodes.length; i++) {
        for (let j = i + 1; j < nodeLinkNodes.length; j++) {
            const source = nodeLinkNodes[i];
            const target = nodeLinkNodes[j];
    
            // Use Graphology's hasEdge to check for edge existence
            if (graph.hasEdge(source, target)) {
                const edgeEntries = graph.edgeEntries(source, target);
                for (const entry of edgeEntries) {
                  const { key, attributes } = entry;
                  nodeLinkEdges.push({
                    source,
                    target,
                    key,
                    ...attributes
                  });
                }
            }
        }
    }
    

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

    for (const [matrixId, matrixNodeIds] of Object.entries(reorderedMatrixGroups)) {
        for (const matrixNodeId of matrixNodeIds) {
            for (const nlNodeId of nodeLinkNodes) {
                if (graph.hasEdge(matrixNodeId, nlNodeId)) {
                    const edgeEntries = graph.edgeEntries(matrixNodeId, nlNodeId);
                    for (const entry of edgeEntries) {
                      const { key, attributes } = entry;
                      matrixToNLLinks.push({
                        source: matrixNodeId,
                        target: nlNodeId,
                        matrix: matrixId,
                        key,
                        ...attributes
                      });
                    }
                  }
                  
            }
        }
    }       

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
        .on("start", event => nodeDragStarted(event, reorderedMatrixGroups))
        .on("drag", event => nodeDragged(event, reorderedMatrixGroups))
        .on("end", event => nodeDragEnded(event, reorderedMatrixGroups, graph)));

    // Update the nodes and links
    return {
        nodes: Object.values(nodeLinkDict),
        links: nodeLinkEdges,
    };
}
