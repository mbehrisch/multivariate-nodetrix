import 'bootstrap/dist/css/bootstrap.min.css';
import * as d3 from 'd3';
import Graph from 'graphology';

import { buildEverything, louvainMatrices, noMatrix } from './utils.js';
import { SetupBinaryOptions, SetupRecreateMatrices } from './page-interaction/binary-buttons.js';
import { SetupCategoricalOptions } from './page-interaction/categorical-buttons.js';
import { SetupNumericalOptions } from './page-interaction/numerical-button.js';
import { SetupDirectionalOptions } from './page-interaction/directional-buttons.js';
import { SetupBaselineOptions }    from './page-interaction/baseline-buttons.js';
import { customNumericalCategoriesFunction } from './page-interaction/numerical-cat-table.js';

const graphDiv = document.getElementById('graph');
const graphRect = graphDiv.getBoundingClientRect();
export const width = graphRect.width;
export const height = graphRect.height;

export const cellSize = 15;
export const nodeSize = 10

export const svg = d3.select("#graph").append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

export const tooltip = d3.select("body").append("div")
    .attr("id", "tooltip");

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
    matrixGroups: {},         // Stores matrices and their nodes
    visualizationMode: 'nodeTrix',
};

//State of buttons
export const buttonState = {
    binaryColour: false,
    binaryStroke: false,
    binarySorted: false,
    categoricalVariableActivated: false,
    categoricalDash: false,
    numericalVariableActivated: false,
    numericalCategoriesActivated: false,
    directionalGradient: false,
    directionalTaper: false,
    directionalArrow: false,
    syncDirectional: null,   // callback set by tapering; called whenever stroke colour changes
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

        appState.graph = graph;
        // appState.matrixGroups = louvainMatrices();
        appState.matrixGroups = noMatrix();

        buildEverything();

        SetupRecreateMatrices();
        SetupBinaryOptions();
        SetupCategoricalOptions();
        SetupNumericalOptions();
        SetupDirectionalOptions();
        SetupBaselineOptions();

        customNumericalCategoriesFunction();

        const viewModeSelect = document.getElementById("view-mode-select");
        if (viewModeSelect) {
            viewModeSelect.value = appState.visualizationMode;
            viewModeSelect.addEventListener("change", event => {
                appState.visualizationMode = event.target.value;
                buildEverything();
            });
        }
        // window.debugEdges is now available. After the page loads, open the browser console and call:
        // debugEdges("AMS", "LHR")
        // It will print a table of all edges between those two airports with their direction, airline, codeshare status, distance, etc.
        window.debugEdges = function(iataA, iataB) {
            const g = appState.graph;
            const nodeA = g.nodes().find(n => g.getNodeAttribute(n, 'IATA') === iataA);
            const nodeB = g.nodes().find(n => g.getNodeAttribute(n, 'IATA') === iataB);
            if (!nodeA) { console.warn(`No node found for IATA "${iataA}"`); return; }
            if (!nodeB) { console.warn(`No node found for IATA "${iataB}"`); return; }
            console.log(`Nodes: ${iataA}=${nodeA}, ${iataB}=${nodeB}`);
            const edges = [];
            g.forEachEdge((key, attrs, source, target) => {
                if ((source === nodeA && target === nodeB) || (source === nodeB && target === nodeA)) {
                    edges.push({ edgeId: key, direction: `${g.getNodeAttribute(source,'IATA')} → ${g.getNodeAttribute(target,'IATA')}`, ...attrs });
                }
            });
            console.log(`${edges.length} edge(s) between ${iataA} and ${iataB}:`);
            console.table(edges);
            return edges;
        };
    });