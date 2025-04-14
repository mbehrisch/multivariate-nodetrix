import Graph from 'https://cdn.skypack.dev/graphology';
import louvain from 'https://cdn.skypack.dev/graphology-communities-louvain';

import { buildMatrix } from './matrix-builder.js';
import { buildNL } from './NL-builder.js';
import { applyForceLayout } from './force-layout.js';
import { getEdgeRelation } from './utils.js';

export const width = 800, height = 600;
export const cellSize = 15;

export const svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

let graph = new Graph();

//Fetch data and initialise graph
fetch("data/data.json")
    .then(res => res.json())
    .then(data => {
        data.nodes.forEach(node => {
            graph.addNode(node.key, { label: node.key, class: node.attributes.class });
        });

        data.edges.forEach(edge => {
            graph.addEdge(edge.source, edge.target, { relation: edge.attributes.Relation });
        });

    console.log(graph.nodes())

    ////initialise graph
    //Louvain algorithm --> prob change to density related
    const communities = louvain(graph);

    //Find the size of communities
    const communitySizes = {};
    Object.values(communities).forEach(c => {
        communitySizes[c] = (communitySizes[c] || 0) + 1;
    });

    //If communities are of size 5+, then they are pushed to a Matrix group
    const matrixGroups = {};
    Object.entries(communities).forEach(([node, comm]) => {
        if (communitySizes[comm] >= 5) {
            if (!matrixGroups[comm]) matrixGroups[comm] = [];
            matrixGroups[comm].push(node);
        }
    });

    
    console.log(matrixGroups)

    //Build the Matrices
    const {dummyNodes, dummyMap} = buildMatrix(graph, matrixGroups);

    //Build the Node-link diagrams
    const { nodes, links } = buildNL(graph, matrixGroups);

    //Add dummyNodes to nodes for force-layout
    dummyNodesToNL(graph, nodes, links, dummyNodes, matrixGroups)


    console.log(links)
    //Apply force layout
    applyForceLayout(graph, nodes, links, dummyMap, matrixGroups);
})


//Local helper function to add dummyNodes to the force-layout
function dummyNodesToNL(graph, nodes, links, dummyNodes, matrixGroups){

        dummyNodes.forEach(dummy => {
            const matrixId = dummy.matrixId;
            const matrixNodeIds = matrixGroups[matrixId];
        
            for (const nlNode of nodes) {
                for (const matrixNodeId of matrixNodeIds) {
                    if (getEdgeRelation(graph, matrixNodeId, nlNode.id)) {
                        links.push({
                            source: dummy.id,
                            target: nlNode.id,
                            relation: 'dummy'
                        });
                        break; // only one link needed per NL node
                    }
                }
            }
        });
        
        // Add dummy nodes after link logic is done
        nodes.push(...dummyNodes);
}
