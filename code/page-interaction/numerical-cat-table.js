import * as d3 from 'd3';

export function getCustomNumericalCategories() {
    const rows = document.querySelectorAll("#numerical-category-table tbody tr");
    const categories = [];

    rows.forEach(row => {
        const label = row.cells[0].querySelector("input").value;
        const min = parseFloat(row.cells[1].querySelector("input").value);
        const max = parseFloat(row.cells[2].querySelector("input").value);

        if (!isNaN(min) && !isNaN(max) && label) {
            categories.push({ label, range: [min, max] });
        }
    });

    return categories;
}

export function customNumericalCategoriesFunction(){
    const maxRows = 8;
    const tableBody = document.querySelector("#numerical-category-table tbody");

    document.getElementById("add-category-row").addEventListener("click", () => {
        if (tableBody.rows.length >= maxRows) return;

        const row = document.createElement("tr");

        row.innerHTML = `
            <td><input type="text" placeholder="Label" /></td>
            <td><input type="number" placeholder="Min" /></td>
            <td><input type="number" placeholder="Max" /></td>
            <td><button class="remove-row">✖</button></td>
        `;

        tableBody.appendChild(row);
        attachRemoveListeners(tableBody);
    });

    attachRemoveListeners(tableBody);
}

function attachRemoveListeners(tableBody) {
    tableBody.querySelectorAll(".remove-row").forEach(btn => {
        btn.onclick = function () {
            if (tableBody.rows.length > 1) {
                btn.closest("tr").remove();
            }
        };
    });
}

export function createNumCatLegend(customNumericalCategories, colorScale){
    //Legend
    const legendList = d3.select("#numerical-legend-list");

    // Create legend items
    customNumericalCategories.forEach(cat => {
        const item = legendList.append("li")
            .attr("class", "legend-item legend-color-item");

        item.append("span")
            .attr("class", "legend-color")
            .style("background-color", colorScale(cat.label));

        item.append("span")
            .text(`${cat.label} (${cat.range[0]} - ${cat.range[1]})`);
    });

    const OutOfRangeItem = legendList.append("li")
        .attr("class", "legend-item legend-color-item");
    
    OutOfRangeItem.append("span")
        .attr("class", "legend-color")
        .style("background-color", "#fc0000");
    
    OutOfRangeItem.append("span")
        .text("Out of Range");
}
