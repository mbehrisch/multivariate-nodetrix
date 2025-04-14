import Graph from 'https://cdn.skypack.dev/graphology';
import louvain from 'https://cdn.skypack.dev/graphology-communities-louvain';

export async function loadAndBuildGraph(path) {
    const res = await fetch(path);
    const data = await res.json();

    const graph = new Graph();

    data.nodes.forEach(node => {
        graph.addNode(node.key, { label: node.key, class: node.attributes.class });
    });

    data.edges.forEach(edge => {
        graph.addEdge(edge.source, edge.target, { relation: edge.attributes.Relation });
    });

    const communities = louvain(graph);
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

    const matrixNodes = Object.values(communityGroups).flat();
    const nodeLinkNodes = graph.nodes().filter(k => !matrixNodes.includes(k));

    const matrixDict = {};
    const nodeLinkDict = {};
    matrixNodes.forEach(k => matrixDict[k] = graph.getNodeAttributes(k));
    nodeLinkNodes.forEach(k => nodeLinkDict[k] = {
        id: k, ...graph.getNodeAttributes(k), x: 0, y: 0, vx: 0, vy: 0, r: 10
    });

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

    const nodeLinkEdges = graph.edges().filter(e => {
        const s = graph.source(e);
        const t = graph.target(e);
        return nodeLinkNodes.includes(s) && nodeLinkNodes.includes(t);
    }).map(e => ({
        source: graph.source(e),
        target: graph.target(e),
        relation: graph.getEdgeAttribute(e, 'relation')
    }));

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

    const matrixPositions = {};
    const dummyNodes = [];
    let i = 0;
    for (const [communityId, nodesInCommunity] of Object.entries(communityGroups)) {
        const size = nodesInCommunity.length;
        const x = 20 + (i % 3) * (cellSize * size + 30 * 2);
        const y = 20 + Math.floor(i / 3) * (cellSize * size + 30 * 2);
        matrixPositions[communityId] = { x, y };

        dummyNodes.push({
            id: `dummy-${communityId}`,
            fx: x + (cellSize * size) / 2,
            fy: y + (cellSize * size) / 2,
            r: cellSize * size * 100,
            dummy: true
        });

        i++;
    }

    return {
        graph,
        communityGroups,
        nodeLinkDict,
        matrixDict,
        matrixLinks,
        nodeLinkEdges,
        interMatrixLinks,
        dummyNodes,
        matrixPositions,
        communities
    };
}
