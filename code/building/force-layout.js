import { appState, svg } from '../main.js';
import { cellSize } from '../main.js';
import { width, height } from '../main.js';

export function applyForceLayout(nodes, links, dummyMap) {
    const graph = appState.graph;
    const reorderedMatrixGroups = appState.matrixGroups;

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
            .attr("y", d => d.y)
            .style("pointer-events", "none");

        Object.entries(dummyMap).forEach(([dummyId, matrixGroup]) => {
            const dummyNode = getNode(dummyId);
            const matrixSize = dummyNode.matrixSize;
            const matrixWidth = matrixSize * cellSize;
            const matrixHeight = matrixSize * cellSize;

            dummyNode.x = Math.max(20, Math.min(800 - matrixWidth, dummyNode.x));
            dummyNode.y = Math.max(20, Math.min(600 - matrixHeight, dummyNode.y));

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
                const sourcePos = MatrixNodeLinkPositions(d.source, d.target, true, reorderedMatrixGroups);
                const targetPos = getNode(d.target);
                return getBezierPath(sourcePos, targetPos, d);
            });

        svg.selectAll(".matrix-matrix-link")
            .attr("d", d => {
                const sourcePos = MatrixNodeLinkPositions(d.source, d.target, false, reorderedMatrixGroups);
                const targetPos = MatrixNodeLinkPositions(d.target, d.source, false, reorderedMatrixGroups);
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

        const edgeTypeBinaryToggle = document.getElementById("edge-binary-color-toggle");
        if (edgeTypeBinaryToggle?.checked) {
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
                    midX = sourcePos.x + dx * 0.75;
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

    function MatrixNodeLinkPositions(sourceNode, targetNode, targetIsNode, reorderedMatrixGroups) {
        const matrixId = Object.keys(reorderedMatrixGroups).find(k => reorderedMatrixGroups[k].includes(sourceNode));
        const dummy = getNode(`dummy-${matrixId}`);
        const matrixX = dummy.x;
        const matrixY = dummy.y;

        const matrixNodeIds = reorderedMatrixGroups[matrixId];
        const rowIndex = matrixNodeIds.indexOf(sourceNode);
        const matrixSize = matrixNodeIds.length;

        const cellY = matrixY + rowIndex * cellSize + cellSize / 2;
        const colX = matrixX + rowIndex * cellSize + cellSize / 2;

        let dx, dy;

        if (!targetIsNode) {
            const otherMatrixId = Object.keys(reorderedMatrixGroups).find(k => reorderedMatrixGroups[k].includes(targetNode));
            const otherDummy = getNode(`dummy-${otherMatrixId}`);
            dx = otherDummy.x - dummy.x;
            dy = otherDummy.y - dummy.y;
        } else {
            dx = getNode(targetNode).x - dummy.x;
            dy = getNode(targetNode).y - dummy.y;
        }

        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx > absDy) {
            if (dx > 0) {
                return { x: matrixX + matrixSize * cellSize, y: cellY };
            } else {
                return { x: matrixX - cellSize, y: cellY };
            }
        } else {
            if (dy > 0) {
                return { x: colX, y: matrixY + matrixSize * cellSize };
            } else {
                return { x: colX, y: matrixY - cellSize };
            }
        }
    }
}
