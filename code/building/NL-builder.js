import { svg } from '../main.js';
import { getEdgeRelation } from '../utils.js';
import { nodeDragStarted, nodeDragged, nodeDragEnded } from '../dragging/NodeDragging.js';

//Builds nodes, establishes node-node paths and node-matrix paths
export function buildNL(graph, matrixGroups){
    //Split up nodes into a group that is going into matrix and into NL nodes
    const matrixNodes = Object.values(matrixGroups).flat();
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
            const relation = getEdgeRelation(graph, source, target);
            if (relation) {
                nodeLinkEdges.push({ source, target, relation });
            }
        }
    }

    //Place NL links and nodes
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
            .on("start", event => nodeDragStarted(event, matrixGroups))
            .on("drag", event => nodeDragged(event, matrixGroups))
            .on("end", event => nodeDragEnded(event, matrixGroups, graph)));

    //Add label to nodes
    const labels = svg.selectAll(".NLlabel")
        .data(Object.values(nodeLinkDict))
        .enter().append("text")
        .attr("class", "label NLlabel")
        .attr("dy", -10)
        .text(d => d.label);

    // Find links between each matrix group and NL nodes
    const matrixToNLLinks = [];

    //Loop over all matrices and the nodes within
    for (const [matrixId, matrixNodeIds] of Object.entries(matrixGroups)) {
        for (const matrixNodeId of matrixNodeIds) {
            //Loop over all NL nodes, if there is a relation, save it, and the matrixId
            for (const nlNodeId of nodeLinkNodes) {
                const relation = getEdgeRelation(graph, matrixNodeId, nlNodeId);
                if (relation) {
                    matrixToNLLinks.push({
                        source: matrixNodeId,
                        target: nlNodeId,
                        relation,
                        matrix: matrixId
                    });
                }
            }
        }
    }

    //Place the links in the canvas, force-layout will properly update the position
    const matrixToNLLinkSelection = svg.selectAll(".matrix-NL-link")
        .data(matrixToNLLinks)
        .enter()
        .append("path")
        .attr("class", "link matrix-NL-link");
    
    //Update the nodes, links
    return {
        nodes: Object.values(nodeLinkDict),
        links: nodeLinkEdges,
    };

}