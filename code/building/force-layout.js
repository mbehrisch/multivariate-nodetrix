import { appState, nodeSize, svg } from '../main.js';
import { cellSize } from '../main.js';
import { width, height } from '../main.js';

export function applyForceLayout(nodes, links, dummyMap) {
    const graph = appState.graph;

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
        const matrixGroups = appState.matrixGroups

        //Find the dummy node of the matrix group that the sourceNode belongs to
        const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(sourceNode));
        const dummyNode = getNode(`dummy-${matrixId}`);

        //Retrieve information about the matrix
        const matrixX = dummyNode.x;
        const matrixY = dummyNode.y;

        const nodesInMatrix = matrixGroups[matrixId];
        const rowIndex = nodesInMatrix.indexOf(sourceNode);
        const matrixSize = nodesInMatrix.length;

        //Find the center of the matrix
        const centerX = matrixX + (matrixSize * cellSize) / 2;
        const centerY = matrixY + (matrixSize * cellSize) / 2;

        //Find the X, and Y position, one of which we will later link to --> middle of the cell
        const cellY = matrixY + rowIndex * cellSize + cellSize / 2;
        const cellX = matrixX + rowIndex * cellSize + cellSize / 2;

        let dx, dy;

        //Find the distance to the center of the targetNode, whether it is in matrix or NL node
        if (!targetIsNode) {
            const otherMatrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(targetNode));
            const targetDummy = getNode(`dummy-${otherMatrixId}`);
            const targetX = targetDummy.x + (matrixSize * cellSize) / 2;
            const targetY = targetDummy.y + (matrixSize * cellSize) / 2;
            dx = targetX - centerX;
            dy = targetY - centerY;
        } else {
            const target = getNode(targetNode);
            dx = target.x - centerX;
            dy = target.y - centerY;
        }

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        //Define connecting point of link based on where the matrix node is position w.r.t. the targetNode
        if (absDx > absDy) {
            if (dx > 0) {
                return { x: matrixX + matrixSize * cellSize, y: cellY };
            } else {
                return { x: matrixX - cellSize, y: cellY };
            }
        } else {
            if (dy > 0) {
                return { x: cellX, y: matrixY + matrixSize * cellSize };
            } else {
                return { x: cellX, y: matrixY - cellSize };
            }
        }
    }
}
