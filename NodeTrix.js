// Imports
import Graph from 'https://cdn.skypack.dev/graphology';
import louvain from 'https://cdn.skypack.dev/graphology-communities-louvain';

const width = 800, height = 600;
const cellSize = 15;

//Define frame and graph
const svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

const graph = new Graph();

//Get data and create graph
fetch("data.json")
    .then(res => res.json())
    .then(data => {
        data.nodes.forEach(node => {
            graph.addNode(node.key, { label: node.key, class: node.attributes.class });
        });

        data.edges.forEach(edge => {
            graph.addEdge(edge.source, edge.target, { relation: edge.attributes.Relation });
        });

        //Determine commmunities for matrices
        const communities = louvain(graph);

        //If communitysize > 5 --> matrix (should prob be density-related)
        const communitySizes = {};
        Object.values(communities).forEach(c => {
            communitySizes[c] = (communitySizes[c] || 0) + 1;
        });

        const communityGroups = {};
        Object.entries(communities).forEach(([node, comm]) => {
            if (communitySizes[comm] >= 5) {
                if (!communityGroups[comm]) communityGroups[comm] = [];
                communityGroups[comm].push(node);
            }
        });

        //Split up nodes into a group that is going into matrix and into NL nodes
        const matrixNodes = Object.values(communityGroups).flat();
        const nodeLinkNodes = graph.nodes().filter(k => !matrixNodes.includes(k));

        const matrixDict = {};
        const nodeLinkDict = {};

        //Define the individual nodes
        matrixNodes.forEach(k => matrixDict[k] = graph.getNodeAttributes(k));
        nodeLinkNodes.forEach(k => nodeLinkDict[k] = {
            id: k,
            ...graph.getNodeAttributes(k),
            x: 0, y: 0, vx: 0, vy: 0, r: 10
        });

        //Find links between matrix and NL
        const matrixLinks = [];
        matrixNodes.forEach(source => {
            nodeLinkNodes.forEach(target => {
                if (graph.hasEdge(source, target)) {
                    matrixLinks.push({ source, target, relation: graph.getEdgeAttribute(source, target, 'relation') });
                } else if (graph.hasEdge(target, source)) {
                    matrixLinks.push({ source, target, relation: graph.getEdgeAttribute(target, source, 'relation') });
                }
            });
        });

        //Find links between NL nodes
        const nodeLinkEdges = graph.edges().filter(e => {
            const s = graph.source(e);
            const t = graph.target(e);
            return nodeLinkNodes.includes(s) && nodeLinkNodes.includes(t);
        }).map(e => ({
            source: graph.source(e),
            target: graph.target(e),
            relation: graph.getEdgeAttribute(e, 'relation')
        }));

        //find links between different matrices
        const interMatrixLinks = [];
        Object.entries(communityGroups).forEach(([commA, nodesA]) => {
            Object.entries(communityGroups).forEach(([commB, nodesB]) => {
                if (commA >= commB) return;
                nodesA.forEach(nodeA => {
                    nodesB.forEach(nodeB => {
                        if (graph.hasEdge(nodeA, nodeB)) {
                            interMatrixLinks.push({
                                source: nodeA,
                                target: nodeB,
                                commSource: commA,
                                commTarget: commB,
                                relation: graph.getEdgeAttribute(nodeA, nodeB, 'relation')
                            });
                        } else if (graph.hasEdge(nodeB, nodeA)) {
                            interMatrixLinks.push({
                                source: nodeA,
                                target: nodeB,
                                commSource: commA,
                                commTarget: commB,
                                relation: graph.getEdgeAttribute(nodeB, nodeA, 'relation')
                            });
                        }
                    });
                });
            });
        });

        //Define dummy nodes for the matrices that work with the push-pull mechanism
        const dummyNodes = [];
        const matrixPositions = {};
        const spacing = 30;
        let i = 0;

        //Loop over all nodes within matrix communities
        for (const [communityId, nodesInCommunity] of Object.entries(communityGroups)) {
            //Place matrices as 3x3 grid to prevent overlap early on
            const size = nodesInCommunity.length;
            const x = 20 + (i % 3) * (cellSize * size + spacing * 2);
            const y = 20 + Math.floor(i / 3) * (cellSize * size + spacing * 2);
            matrixPositions[communityId] = { x, y };

            //Create dummy node
            dummyNodes.push({
                id: `dummy-${communityId}`,
                fx: x + (cellSize * size) / 2,
                fy: y + (cellSize * size) / 2,
                r: cellSize * size * 100
            });

            i++;
        }

        //Simulation of NL nodes and dummy nodes of the matrices
        const simulation = d3.forceSimulation([...Object.values(nodeLinkDict), ...dummyNodes])
            .force("link", d3.forceLink(nodeLinkEdges).id(d => d.id).distance(80)
                .strength(0.7))
            .force("charge", d3.forceManyBody()
                .strength(d => d.dummy ? -30 : -70))
            .force("center", d3.forceCenter(width / 2, height / 2));

        //Ensure that nothing can be pushed outside of the frame
        simulation.force("bounding-box", () => {
            for (const node of Object.values(nodeLinkDict)) {
                node.x = clamp(node.x, node.r, width - node.r);
                node.y = clamp(node.y, 20 + node.r, height - node.r);
            }
        });

        //Place NL links and nodes
        const links = svg.selectAll(".link")
            .data(nodeLinkEdges)
            .enter().append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("stroke", d => d.relation === "Family" ? "red" : "blue")
            .attr("stroke-width", 1);

        const nodes = svg.selectAll(".node")
            .data(Object.values(nodeLinkDict))
            .enter().append("circle")
            .attr("class", "node")
            .attr("r", d => d.r)
            .attr("fill", "black")
            .call(d3.drag()
                .on("start", nodeDragStarted)
                .on("drag", nodeDragged)
                .on("end", nodeDragEnded));

        //Add label to nodes
        const labels = svg.selectAll(".label")
            .data(Object.values(nodeLinkDict))
            .enter().append("text")
            .attr("class", "label")
            .attr("text-anchor", "middle")
            .attr("dy", -15)
            .text(d => d.label);

        //Add intermatrix links
        svg.selectAll(".inter-matrix-link")
            .data(interMatrixLinks)
            .enter().append("path")
            .attr("class", "inter-matrix-link")
            .attr("stroke", d => d.relation === "Family" ? "red" : "blue")
            .attr("stroke-width", 0.5)
            .attr("fill", "none");

        i = 0;

        //For each matrix community, place a matrix
        for (const [communityId, nodesInCommunity] of Object.entries(communityGroups)) {
            const pos = matrixPositions[communityId];

            const matrixSvg = svg.append("g")
                .attr("transform", `translate(${pos.x},${pos.y})`)
                //Dragging behaviour of matrices
                .call(d3.drag()
                    .on("start", function (event) {
                        this._drag = { x: event.x, y: event.y };
                    })
                    .on("drag", function (event) {
                        const dx = event.x - this._drag.x;
                        const dy = event.y - this._drag.y;
                        const p = matrixPositions[communityId];
                        const size = communityGroups[communityId].length;

                        //Ensure that you cannot move the matrix outside of the frame
                        p.x = clamp(p.x + dx, 20, width - cellSize * size - 20);
                        p.y = clamp(p.y + dy, 20, height - cellSize * size - 20);
                        d3.select(this).attr("transform", `translate(${p.x},${p.y})`);

                        //Ensure that the dummy moves with the matrix
                        const dummy = dummyNodes.find(d => d.id === `dummy-${communityId}`);
                        dummy.fx = null;
                        dummy.fy = null;
                        dummy.x = p.x + (cellSize * size) / 2;
                        dummy.y = p.y + (cellSize * size) / 2;

                        //Trigger the simulation
                        simulation.alpha(0.3).restart();
                        this._drag = { x: event.x, y: event.y };
                        ticked();
                    }));

            //Actually make the matrix
            const rows = matrixSvg.selectAll(".row")
                .data(nodesInCommunity)
                .enter().append("g")
                .attr("class", "row")
                .attr("transform", (d, j) => `translate(0, ${j * cellSize})`);

            //Add cells with color-coding based on relation type
            rows.selectAll(".cell")
                .data(row => nodesInCommunity.map(col => {
                    let edge = null;
                    if (graph.hasEdge(row, col)) {
                        edge = graph.edge(row, col);
                    } else if (graph.hasEdge(col, row)) {
                        edge = graph.edge(col, row);
                    }
                    const relation = edge ? graph.getEdgeAttribute(edge, "relation") : null;
                    return {
                        row,
                        col,
                        relation,
                        value: edge ? 1 : 0
                    };
                }))
                .enter().append("rect")
                .attr("class", "cell")
                .attr("x", (d, i) => i * cellSize)
                .attr("width", cellSize)
                .attr("height", cellSize)
                .attr("fill", d =>
                    d.row === d.col ? "grey" :
                        d.relation === "Family" ? "red" :
                        d.relation === "Friend" ? "blue" :
                        "white")
                .attr("stroke", "gray");

            //Add labels
            matrixSvg.selectAll(".col-label")
                .data(nodesInCommunity)
                .enter().append("text")
                .attr("class", "col-label")
                .attr("x", (d, i) => i * cellSize + cellSize / 2)
                .attr("y", -5)
                .attr("text-anchor", "middle")
                .text(d => d);

            matrixSvg.selectAll(".row-label")
                .data(nodesInCommunity)
                .enter().append("text")
                .attr("class", "row-label")
                .attr("x", -10)
                .attr("y", (d, i) => i * cellSize + cellSize / 2)
                .attr("dy", ".35em")
                .attr("text-anchor", "middle")
                .text(d => d)
                .attr("stroke", "white")
                .attr("stroke-width", 3)
                .attr("paint-order", "stroke");

            //Add the matrix-NL links per community (needed for community)
            svg.selectAll(`.matrix-link-${communityId}`)
                .data(matrixLinks.filter(link => communityGroups[communityId].includes(link.source)))
                .enter().append("path")
                .attr("class", `matrix-link matrix-link-${communityId}`)
                .attr("stroke", d => d.relation === "Family" ? "red" : "blue")
                .attr("stroke-width", 0.5)
                .attr("fill", "none");

            //Next community/node
            i++;
        }

        //Now define the simulation
        simulation.on("tick", ticked);
        function ticked() {
            links.attr("d", d => {
                const source = getNode(d.source);
                const target = getNode(d.target);
                const midX = (source.x + target.x) / 2;
                //Bezier curves (start, curve, end)
                return `M${source.x},${source.y} C${midX},${source.y} ${midX},${target.y} ${target.x},${target.y}`;
            });

            nodes.attr("cx", d => clamp(d.x, d.r, width - d.r))
                .attr("cy", d => clamp(d.y, d.r, height - d.r));

            labels.attr("x", d => clamp(d.x, d.r, width - d.r))
                .attr("y", d => clamp(d.y, d.r, height - d.r));

            svg.selectAll(".matrix-link")
                .attr("d", d => {
                    const matrixId = communities[d.source];
                    const pos = matrixPositions[matrixId];
                    const localNodes = communityGroups[matrixId];
                    const sx = pos.x + cellSize * localNodes.length;
                    const sy = pos.y + cellSize * localNodes.indexOf(d.source) + cellSize / 2;
                    const tx = clamp(getNode(d.target).x, 0, width);
                    const ty = clamp(getNode(d.target).y, 0, height);
                    const midX = (sx + tx) / 2;
                    return `M${sx},${sy} C${midX},${sy} ${midX},${ty} ${tx},${ty}`;
                });

            svg.selectAll(".inter-matrix-link")
                .attr("d", d => {
                    const sPos = matrixPositions[d.commSource];
                    const tPos = matrixPositions[d.commTarget];
                    const sIdx = communityGroups[d.commSource].indexOf(d.source);
                    const tIdx = communityGroups[d.commTarget].indexOf(d.target);
                    const sx = sPos.x + cellSize * communityGroups[d.commSource].length;
                    const sy = sPos.y + sIdx * cellSize + cellSize / 2;
                    const tx = tPos.x;
                    const ty = tPos.y + tIdx * cellSize + cellSize / 2;
                    const midX = (sx + tx) / 2;
                    return `M${sx},${sy} C${midX},${sy} ${midX},${ty} ${tx},${ty}`;
                });
        }

        //Helper clamp function to keep things within frame
        function clamp(val, min, max) {
            return Math.max(min, Math.min(max, val));
        }

        //Helper function to help with mismatch of d3 and Graphology
        function getNode(n) {
            return typeof n === 'object' ? n : nodeLinkDict[n];
        }

        //Node dragging events
        function nodeDragStarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function nodeDragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function nodeDragEnded(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }
    });
