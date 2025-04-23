import { svg } from "../main.js";

////For a variety of node types, set colour scheme
export function applyJobColorScale(graph) {
    const jobs = Array.from(new Set(graph.nodes().map(n => graph.getNodeAttribute(n, "job"))));
    console.log(jobs)
    const jobColor = d3.scaleOrdinal()
        .domain(jobs)
        .range(d3.schemeTableau10);

    svg.selectAll(".node")
        .raise()
        .attr("fill", d => {
            const job = graph.getNodeAttribute(d.id, "job");
            return jobColor(job);
        });

    // svg.selectAll(".cellLabel")
    //     .attr("fill", d => {
    //         const job = graph.getNodeAttribute(d.id, "job");
    //         return jobColor(job);
    //     });
}

  
