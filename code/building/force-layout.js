//Called when the force-directed layout needs updating

import { svg } from '../main.js';
import { cellSize } from '../main.js';
import { width, height } from '../main.js';

let simulation = null
export function getSimulation(){
    return simulation
}

export function applyForceLayout(graph, nodes, links, dummyMap, matrixGroups) {
    //Define simulation on updated nodes and links
    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
            .id(d => d.id)
            .distance(100)
        )
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(width / 2, height / 2))

        //Prevent collision between nodes and matrices  
        .force("collide", d3.forceCollide().radius(d => {
            // Give dummy nodes a larger collision radius based on matrix size
            if (d.id && d.id.startsWith("dummy-")) {
                return d.matrixSize * cellSize*1.5;
            }
            return d.r + 10; // default NL node collision radius
        }))
        
        .on("tick", ticked);
    
    //Actually update positions. Must run once for initilisation of graph
    function ticked() {
        // Move node-link nodes and labels
        svg.selectAll(".node")
            .attr("cx", d => d.x = Math.max(10, Math.min(width - 10, d.x)))
            //Extra space at the top for labels
            .attr("cy", d => d.y = Math.max(20, Math.min(height - 10, d.y)));

        svg.selectAll(".NLlabel")
            .attr("x", d => d.x)
            .attr("y", d => d.y);

        // Move dummies and attached matrices
        Object.entries(dummyMap).forEach(([dummyId, matrixGroup]) => {
            const dummyNode = getNode(dummyId);

            // Get matrix size for bounds calculation
            const matrixSize = dummyNode.matrixSize
            const matrixWidth = matrixSize * cellSize;
            const matrixHeight = matrixSize * cellSize;
        
            // Clamp dummy node position so matrix stays in bounds (as well as labels)
            dummyNode.x = Math.max(20, Math.min(800 - matrixWidth, dummyNode.x));
            dummyNode.y = Math.max(20, Math.min(600 - matrixHeight, dummyNode.y));
        
            matrixGroup.attr("transform", `translate(${dummyNode.x}, ${dummyNode.y})`);
        });

        // Update NL links
        svg.selectAll(".NLlink")
            .attr("d", d => {
                const source = getNode(d.source);
                const target = getNode(d.target);
                const midX = (source.x + target.x) / 2;

                return `M${source.x},${source.y} 
                        C${midX},${source.y} 
                        ${midX},${target.y} 
                        ${target.x},${target.y}`;
            });

        // Update matrix-NL links
        svg.selectAll(".matrix-NL-link")
        .attr("d", d => {
            //Find the position of the node's row within the matrix
            const sourcePos = getMatrixNodePos(d.source);
            const target = getNode(d.target);
            const midX = (sourcePos.x + target.x) / 2;
    
            return `M${sourcePos.x},${sourcePos.y} 
                    C${midX},${sourcePos.y} 
                    ${midX},${target.y} 
                    ${target.x},${target.y}`;
        });

        // Update matrix-matrix links
        svg.selectAll(".matrix-matrix-link")
        .raise()
        .attr("d", d => {
            const sourcePos = getMatrixNodePos(d.source);
            const targetPos = getMatrixNodePos(d.target);
            const midX = (sourcePos.x + targetPos.x) / 2;
    
            return `M${sourcePos.x},${sourcePos.y} 
                    C${midX},${sourcePos.y} 
                    ${midX},${targetPos.y} 
                    ${targetPos.x},${targetPos.y}`;
        });
    
    }

    // Helper to resolve node from ID or object
    function getNode(n) {
        if (typeof n === 'object') 
            return n;
        else 
            return nodes.find(d => d.id === n);
    }

    //Helper function to find the the location of the row of the node given the location of the dummy
    function getMatrixNodePos(nodeId) {
        // Which matrix is it in
        const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(nodeId));
        const dummy = getNode(`dummy-${matrixId}`);
        const matrixNodeIds = matrixGroups[matrixId];
        const rowIndex = matrixNodeIds.indexOf(nodeId);
    
        return {
            x: dummy.x + cellSize * matrixNodeIds.length - 1,
            y: dummy.y + rowIndex * cellSize + cellSize / 2
        };
    }
}
