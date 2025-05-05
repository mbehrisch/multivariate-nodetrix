import { appState, buttonState, svg } from '../main.js';
import { cellSize } from '../main.js';
import { width, height } from '../main.js';

export function applyForceLayout(nodes, links, dummyMap) {
    const graph = appState.graph;
    const matrixGroups = appState.matrixGroups;

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
            return d.r + 10;
        }))
        .on("tick", ticked);

    function ticked() {
        svg.selectAll(".node")
            .attr("cx", d => d.x = Math.max(10, Math.min(width - 10, d.x)))
            .attr("cy", d => d.y = Math.max(20, Math.min(height - 10, d.y)));

        svg.selectAll(".NLlabel")
            .attr("x", d => d.x)
            .attr("y", d => d.y);

        Object.entries(dummyMap).forEach(([dummyId, matrixGroup]) => {
            const dummyNode = getNode(dummyId);
            const matrixSize = dummyNode.matrixSize;
            const matrixWidth = matrixSize * cellSize;

            dummyNode.x = Math.max(20, Math.min(800 - matrixWidth, dummyNode.x));
            dummyNode.y = Math.max(20, Math.min(600 - matrixWidth, dummyNode.y));

            matrixGroup.attr("transform", `translate(${dummyNode.x}, ${dummyNode.y})`);
        });

        svg.selectAll(".NLlink")
            .attr("d", d => {
                const sourcePos = getNode(d.source);
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos, d);
            });

        svg.selectAll(".matrix-NL-link")
            .attr("d", d => {
                const sourcePos = NodeInMatrixPosition(d.source, d.target, true);
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos, d);
            });

        svg.selectAll(".matrix-matrix-link")
            .attr("d", d => {
                const sourcePos = NodeInMatrixPosition(d.source, d.target, false);
                const targetPos = NodeInMatrixPosition(d.target, d.source, false);
                return getBezierPath(sourcePos, targetPos, d);
            });
    }

    function getNode(n) {
        if (typeof n === 'object') return n;
        return nodes.find(d => d.id === n);
    }

    function getBezierPath(sourcePos, targetPos, d) {
        let verticalOffset = 10;

        //This only works if there is no directionality
        let TempStore = null
        if (targetPos.x <sourcePos.x){
            TempStore = targetPos
            targetPos = sourcePos
            sourcePos = TempStore
        }
        
        const dx = targetPos.x - sourcePos.x;
        const dy = targetPos.y - sourcePos.y;
        let midX = sourcePos.x + dx / 2;

        if (buttonState.binaryVariable) {
            const srcId = typeof d.source === "object" ? d.source.id : d.source;
            const tgtId = typeof d.target === "object" ? d.target.id : d.target;
            const entries = [...graph.edgeEntries(srcId, tgtId)];

            if (entries.length > 0) {
                const attributes = entries[0].attributes;
                if (attributes.codeshare === "Y") {
                    verticalOffset = 10;
                    //midX = sourcePos.x + dx * 0.75;
                } else {
                    verticalOffset = 10;
                    //midX = sourcePos.x + dx * 0.75;
                }
            }
        }

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

        //Find the dummy node of the matrix group
        const matrixId = Object.keys(matrixGroups).find(k => matrixGroups[k].includes(sourceNode));
        const dummy = getNode(`dummy-${matrixId}`);

        //Retrieve information about the matrix
        const matrixX = dummy.x;
        const matrixY = dummy.y;

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

        //Find the distance to the center of a matrix or node
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
