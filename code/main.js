import Graph from 'https://cdn.skypack.dev/graphology';
import louvain from 'https://cdn.skypack.dev/graphology-communities-louvain';

import { getEdgeRelation } from './utils.js';
import { buildEverything } from './utils.js';

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

    buildEverything(graph, matrixGroups)
})