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
