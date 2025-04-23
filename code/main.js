import Graph from 'https://cdn.skypack.dev/graphology';
import louvain from 'https://cdn.skypack.dev/graphology-communities-louvain';

import { buildEverything } from './utils.js';
import { addCodeshareColourLegend } from './pageInteraction/EdgeButtons.js';

export const width = 800, height = 600;
export const cellSize = 15;

export const svg = d3.select("#graph").append("svg")
    .attr("width", width)
    .attr("height", height);

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

        console.log(graph.nodes());

        // Louvain community detection
        const communities = louvain(graph);

        // Count sizes of communities
        const communitySizes = {};
        Object.values(communities).forEach(c => {
            communitySizes[c] = (communitySizes[c] || 0) + 1;
        });

        // Group large communities (5+ nodes) into matrices
        const matrixGroups = {};
        Object.entries(communities).forEach(([node, comm]) => {
            if (communitySizes[comm] >= 5) {
                if (!matrixGroups[comm]) matrixGroups[comm] = [];
                matrixGroups[comm].push(node);
            }
        });

        console.log(matrixGroups);

        buildEverything(graph, matrixGroups);

        addCodeshareColourLegend();
    });