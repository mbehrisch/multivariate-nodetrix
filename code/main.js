import Graph from 'https://cdn.skypack.dev/graphology';

import { buildEverything, louvainMatrices } from './utils.js';
//import { SetupCagegoricalColour, SetupBinaryColour } from './pageInteraction/EdgeButtons.js';
import { SetupBinaryOptions, SetupRecreateMatrices } from './pageInteraction/BinaryButtons.js';
import { SetupCategoricalColour } from './pageInteraction/CategoricalButtons.js';
import { SetupNumericalOptions } from './pageInteraction/NumericalButton.js';
import { customNumericalCategoriesFunction } from './pageInteraction/NumericalCatTable.js';

const graphDiv = document.getElementById('graph');
export const width = graphDiv.clientWidth;
export const height = graphDiv.clientHeight;

export const cellSize = 15;
export const nodeSize = 10

export const svg = d3.select("#graph").append("svg")
    .attr("width", width)
    .attr("height", height);

//Define specifications of the dataset. These are to be attributes of nodes and edges as depicted below
export const datasetSpec = {
    label: "IATA",  //For the flight data the IATA attribute is the label
    binaryVar: "codeshare", //Codeshare is my binary value: expects true, false
    categoricalVar: "airlinecountry", //Airline operator is my categorical value
    numericalVar: "distance_km"
}

export const appState = {
    graph: null,              // Holds the graph data
    sim: null,                // Holds the simulation state
    matrixGroups: {},          // Stores matrices and their nodes (),
};

//State of buttons
export const buttonState = {
    binaryColour: false,
    binaryStroke: false,
    binarySorted: false,
//    binaryMatrices: false,
    categoricalVariableActivated: false,
    numericalVariableActivated: false,
    numericalCategoriesActivated: false
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
                equipment: edge.attributes.equipment,
                airlinecountry:edge.attributes.airlinecountry,
                distance_km: edge.attributes.distance_km,
            });
        });

        console.log("Graph loaded:", graph.export());

        appState.graph = graph;
        appState.matrixGroups = louvainMatrices();

        buildEverything();

        SetupRecreateMatrices();
        SetupBinaryOptions();
        SetupCategoricalColour();
        SetupNumericalOptions();

        customNumericalCategoriesFunction();
        

    });