import Graph from 'https://cdn.skypack.dev/graphology';
import louvain from 'https://cdn.skypack.dev/graphology-communities-louvain';

import { buildEverything } from './utils.js';
import { addCategoricalColourLegend, addBinaryColourLegend } from './pageInteraction/EdgeButtons.js';

export const width = 800, height = 600;
export const cellSize = 15;

export const svg = d3.select("#graph").append("svg")
    .attr("width", width)
    .attr("height", height);

export const appState = {
    graph: null,              // Holds the graph data
    sim: null,                // Holds the simulation state
    matrixGroups: {},          // Stores matrices and their nodes (),
};

//State of buttons
export const buttonState = {
    binaryVariable: false,
    binarySorted: false,
    categoricalVariable: false
}

let graph = new Graph({ multi: true });

//Fetch data and initialise graph
fetch("data/sampled_data.json")
    .then(res => res.json())
    .then(data => {
        // Add nodes
        data.nodes.forEach(node => {
            graph.addNode(node.key, {
                airport: node.attributes.name,
                city: node.attributes.city,
                country: node.attributes.country,
                IATA: node.attributes.IATA,
                ICAO: node.attributes.ICAO,
                latitude: node.attributes.latitude,
                longitude: node.attributes.longitude,
                timezone: node.attributes.timezone
            });
        });

        // Add edges
        data.edges.forEach(edge => {
            // Since it's a Multi-Graph, we can have multiple edges between nodes
            graph.addEdge(edge.source, edge.target, {
                airline: edge.attributes.airline,
                airline_id: edge.attributes.airline_id,
                codeshare: edge.attributes.codeshare,
                stops: edge.attributes.stops,
                equipment: edge.attributes.equipment
            });
        });

        // Louvain community detection
        const communities = louvain(graph);

        const matrixGroups = {};
        Object.entries(communities).forEach(([node, comm]) => {
            if (!matrixGroups[comm]) matrixGroups[comm] = [];
            matrixGroups[comm].push(node);
        });

        appState.graph = graph;
        appState.matrixGroups = matrixGroups;

        console.log(appState.matrixGroups);

        addBinaryColourLegend();
        addCategoricalColourLegend();
        
        buildEverything();
    });