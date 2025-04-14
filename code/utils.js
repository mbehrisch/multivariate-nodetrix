//Helper function that finds if two nodes have an edge in any direction
export function getEdgeRelation(graph, source, target) {
    if (graph.hasEdge(source, target)) {
        return graph.getEdgeAttribute(source, target, 'relation');
    } 
    else if (graph.hasEdge(target, source)) {
        return graph.getEdgeAttribute(target, source, 'relation');
    }
    return null;
}