import { appState, nodeSize, svg } from '../main.js';
import { cellSize } from '../main.js';
import { width, height } from '../main.js';

export function applyForceLayout(nodes, links, dummyMap) {
    appState.sim = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links)
            .id(d => d.id)
            .distance(100)
        )
        .force("charge", d3.forceManyBody().strength(-50))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(d => {
            if (d.id && d.id.startsWith("dummy-")) {
                return d.matrixSize * cellSize * 1.5;
            }
            return d.r + nodeSize;
        }))
        .on("tick", ticked);

    function ticked() {
        //Move nodes and their labels within width and height
        svg.selectAll(".node")
            .attr("cx", d => d.x = Math.max(nodeSize, Math.min(width - nodeSize, d.x)))
            .attr("cy", d => d.y = Math.max(nodeSize+10, Math.min(height - nodeSize, d.y)));

        svg.selectAll(".NLlabel")
            .attr("x", d => d.x)
            .attr("y", d => d.y);

        //Move matrices based on their dummyNodes
        Object.entries(dummyMap).forEach(([dummyId, matrixSvg]) => {
            const dummyNode = getNode(dummyId);
            const matrixSize = dummyNode.matrixSize;
            const matrixWidth = matrixSize * cellSize;

            dummyNode.x = Math.max(20, Math.min(width - matrixWidth, dummyNode.x));
            dummyNode.y = Math.max(20, Math.min(height - matrixWidth, dummyNode.y));

            matrixSvg.attr("transform", `translate(${dummyNode.x}, ${dummyNode.y})`);
        });

        //Draw links, NL links can simply use the node information
        svg.selectAll(".NLlink")
            .attr("d", d => {
                const sourcePos = getNode(d.source);
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos);
            });
        
        
        svg.selectAll(".matrix-NL-link")
            .attr("d", d => {
                //Source is always the matrix, target is node
                const sourcePos = NodeInMatrixPosition(d.source, d.target, true);
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos);
            });

        svg.selectAll(".matrix-matrix-link")
            .attr("d", d => {
                //Both source and target are matrix
                const sourcePos = NodeInMatrixPosition(d.source, d.target, false);
                const targetPos = NodeInMatrixPosition(d.target, d.source, false);
                return getBezierPath(sourcePos, targetPos);
            });
    }

    //Safety function --> d3 ForceLayout mismatchting
    function getNode(n) {
        if (typeof n === 'object') return n;
        return nodes.find(d => d.id === n);
    }

    //Find BezierPath of two locaitions
    function getBezierPath(sourcePos, targetPos) {
        let verticalOffset = 10; //Magic variable
        
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        let midX = sourcePos.x + dx / 2;

        const controlY1 = sourcePos.y + (dy > 0 ? verticalOffset : -verticalOffset);
        const controlY2 = targetPos.y + (dy > 0 ? -verticalOffset : verticalOffset);

        return `M${sourcePos.x},${sourcePos.y}
                C${midX},${controlY1}
                ${midX},${controlY2}
                ${targetPos.x},${targetPos.y}`;
    }

    //Retrieves the position of a node in a matrix, considering which border of the matrix sohuld be connected to based on the other nodes position
    //sourceNode is always in a matrix, targetNode can be NL node (targetIsNode = true) or matrix node
    function NodeInMatrixPosition(sourceNode, targetNode, targetIsNode) {
        const matrixGroups = appState.matrixGroups;
    
        // Local Helper to get matrix center and dimensions
        function getMatrixInfo(node) {
            const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(node));
            const dummyNode = getNode(`dummy-${matrixId}`);
            const nodesInMatrix = matrixGroups[matrixId];
            const matrixSize = nodesInMatrix.length;
            return {
                dummyNode,
                matrixId,
                matrixX: dummyNode.x,
                matrixY: dummyNode.y,
                matrixSize,
                rowIndex: nodesInMatrix.indexOf(node)
            };
        }
        
        
        const sourceInfo = getMatrixInfo(sourceNode);
    
        let targetX, targetY;
        
        //Get targetNode location based on if it is a matrix or not
        if (!targetIsNode) {
            const targetInfo = getMatrixInfo(targetNode);
            targetX = targetInfo.dummyNode.x + (targetInfo.matrixSize * cellSize) / 2;
            targetY = targetInfo.dummyNode.y + (targetInfo.matrixSize * cellSize) / 2;
        } else {
            const target = getNode(targetNode);
            targetX = target.x;
            targetY = target.y;
        }
    
        //Use the center of the matrix to determine which matrix side to link to
        const centerX = sourceInfo.matrixX + (sourceInfo.matrixSize * cellSize) / 2;
        const centerY = sourceInfo.matrixY + (sourceInfo.matrixSize * cellSize) / 2;
    
        const dx = targetX - centerX;
        const dy = targetY - centerY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
    
        //Calculate X and Y to use if that is where the link will be to
        const cellX = sourceInfo.matrixX + sourceInfo.rowIndex * cellSize + cellSize / 2;
        const cellY = sourceInfo.matrixY + sourceInfo.rowIndex * cellSize + cellSize / 2;
    
        // Choose link edge (top, bottom, left, right)
        if (absDx > absDy) {
            if (dx > 0) {
                return { x: sourceInfo.matrixX + sourceInfo.matrixSize * cellSize, y: cellY }; // right edge
            } else {
                return { x: sourceInfo.matrixX - cellSize, y: cellY }; // left edge
            }
        } else {
            if (dy > 0) {
                return { x: cellX, y: sourceInfo.matrixY + sourceInfo.matrixSize * cellSize }; // bottom edge
            } else {
                return { x: cellX, y: sourceInfo.matrixY - cellSize }; // top edge
            }
        }
    }
    
}
