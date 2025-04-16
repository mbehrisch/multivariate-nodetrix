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
                const sourcePos = getNode(d.source);
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos)
            });

        // Update matrix-NL links
        svg.selectAll(".matrix-NL-link")
        .attr("d", d => {
            //Source is always the matrix, decide which side to take
            const sourcePos = MatrixNodeLinkPositions(d.source, d.target, true);
            //Target is always the node, can be read directly
            const targetPos = getNode(d.target)
      
            return getBezierPath(sourcePos, targetPos)
        });
      

        // Update matrix-matrix links
        svg.selectAll(".matrix-matrix-link")
        .raise()
        .attr("d", d => {
            //Both are matrices, so both need to decide which side
            const sourcePos = MatrixNodeLinkPositions(d.source, d.target, false);
            const targetPos = MatrixNodeLinkPositions(d.target, d.source, false);
    
            return getBezierPath(sourcePos, targetPos)
        });
    
    }

    // Helper to resolve node from ID or object
    function getNode(n) {
        if (typeof n === 'object') 
            return n;
        else 
            return nodes.find(d => d.id === n);
    }

    //Helper function to draw BezierPaths
    function getBezierPath(sourcePos, targetPos) {
        const verticalOffset = 10
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
    
        // Midpoint between source and target
        const midX = sourcePos.x + dx / 2;
    
        // Add offset to reduce overlap — push up/down based on direction
        const controlY1 = sourcePos.y + (dy > 0 ? verticalOffset : -verticalOffset);
        const controlY2 = targetPos.y + (dy > 0 ? -verticalOffset : verticalOffset);
    
        return `M${sourcePos.x},${sourcePos.y}
                C${midX},${controlY1}
                ${midX},${controlY2}
                ${targetPos.x},${targetPos.y}`;
    }
    
    //Helper function to find the matrixNode position as well as either the externalNode position (either matrix or node)
    function MatrixNodeLinkPositions(sourceNode, targetNode, targetIsNode) {
        // Find matrix group and dummy node of source node
        const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(sourceNode));
        const dummy = getNode(`dummy-${matrixId}`);
        const matrixX = dummy.x;
        const matrixY = dummy.y;
        
        const matrixNodeIds = matrixGroups[matrixId];
        //Find index and size of matrix source
        const rowIndex = matrixNodeIds.indexOf(sourceNode);
        const matrixSize = matrixNodeIds.length;
    
        // Compute matrix cell center of source
        const cellY = matrixY + rowIndex * cellSize + cellSize / 2;
        const colX = matrixX + rowIndex * cellSize + cellSize / 2;

        //initisialize
        let dx,dy;
        
        //If the target is in a matrix
        if (!targetIsNode){

            //Find the matrix it is in and its dummy
            const otherMatrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(targetNode));
            const otherDummy = getNode(`dummy-${otherMatrixId}`);

            // Figure out direction from matrix to external node
            dx = otherDummy.x - dummy.x;
            dy = otherDummy.y - dummy.y;
        }else{
            //Read the direction of the node directly
            dx = targetNode.x - dummy.x;
            dy = targetNode.y - dummy.y;

            dx = getNode(targetNode).x - dummy.x;
            dy = getNode(targetNode).y - dummy.y;
        }

        //Take absolutes of the distance to find which direction to go
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Link to left or right of row
        if (absDx > absDy) {
            if (dx > 0) {
                // Right
                return { x: matrixX + matrixSize * cellSize, y: cellY };
            } else {
                // Left
                return { x: matrixX - cellSize, y: cellY }; //X-cellSize to link to label
            }
        // Link to top or bottom of column
        } else {
            if (dy > 0) {
                // Bottom
                return { x: colX, y: matrixY + matrixSize * cellSize };
            } else {
                // Top
                return { x: colX, y: matrixY - cellSize }; //Y-cellSize to link to label
            }
        }
    }
}
