import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, "outputs");
const outputPath = path.join(outputDir, "cultstore_marketing_budget_tracker.xlsx");

const workbook = Workbook.create();

const titleFill = "#1F4E78";
const sectionFill = "#D9EAF7";
const accentFill = "#EAF3E3";
const warnFill = "#FCE4D6";
const white = "#FFFFFF";
const grid = "#D0D7DE";

const categories = [
  ["Apparel", 1200000, 0.18],
  ["Footwear", 1000000, 0.15],
  ["Massage Oils", 500000, 0.08],
  ["Accessories", 650000, 0.1],
  ["Indoor Equipment", 900000, 0.14],
  ["Cycles", 1400000, 0.22],
  ["Other", 400000, 0.06],
];

const statuses = [["Draft"], ["Raised"], ["Invoiced"], ["Paid"], ["Cancelled"]];
const spendTypes = [
  ["Influencer"],
  ["Event"],
  ["Partnership"],
  ["Social Media"],
  ["Agency Retainer"],
  ["Production"],
  ["Gifting"],
  ["Travel"],
  ["Other"],
];

function styleHeader(range) {
  range.format.fill.color = titleFill;
  range.format.font.bold = true;
  range.format.font.color = white;
  range.format.horizontalAlignment = "center";
  range.format.verticalAlignment = "center";
}

function styleSubHeader(range) {
  range.format.fill.color = sectionFill;
  range.format.font.bold = true;
}

function applyBorders(range) {
  range.format.borders.top.color = grid;
  range.format.borders.bottom.color = grid;
  range.format.borders.left.color = grid;
  range.format.borders.right.color = grid;
}

const setupSheet = workbook.worksheets.add("Setup");
setupSheet.getRange("A1:C1").values = [["Category", "Annual Budget", "Marketing Mix %"]];
setupSheet.getRange("A2:C8").values = categories;
setupSheet.getRange("E1:E6").values = [["PO Status"], ...statuses];
setupSheet.getRange("G1:G10").values = [["Spend Type"], ...spendTypes];
styleHeader(setupSheet.getRange("A1:C1"));
styleHeader(setupSheet.getRange("E1:E1"));
styleHeader(setupSheet.getRange("G1:G1"));
setupSheet.getRange("A1:C8").format.numberFormat = [["@", "#,##0", "0%"]];
setupSheet.getRange("A:C").format.autofitColumns();
setupSheet.getRange("E:G").format.autofitColumns();
setupSheet.freezePanes.freezeRows(1);

const poSheet = workbook.worksheets.add("PO Log");
poSheet.getRange("A1:J2").merge();
poSheet.getRange("A1").value = "CultStore Marketing Purchase Order Tracker";
poSheet.getRange("A1").format.fill.color = titleFill;
poSheet.getRange("A1").format.font.color = white;
poSheet.getRange("A1").format.font.bold = true;
poSheet.getRange("A1").format.font.size = 16;
poSheet.getRange("A1").format.horizontalAlignment = "left";

poSheet.getRange("A4:J4").values = [[
  "PO Date",
  "PO Number",
  "Category",
  "Spend Type",
  "Spend Purpose",
  "Agency / Vendor",
  "Requested By",
  "PO Amount",
  "Invoice Amount",
  "Status",
]];
styleHeader(poSheet.getRange("A4:J4"));

const sampleRows = [
  [new Date("2026-04-01"), "PO-001", "Apparel", "Influencer", "Launch campaign creator fee", "Alpha Talent", "Anirudh", 125000, 125000, "Paid"],
  [new Date("2026-04-05"), "PO-002", "Footwear", "Event", "Retail activation setup", "LiveWire Events", "Anirudh", 180000, 0, "Raised"],
  [new Date("2026-04-08"), "PO-003", "Cycles", "Partnership", "Brand collaboration with cycling club", "UrbanPedal", "Anirudh", 95000, 0, "Invoiced"],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
  [null, "", "", "", "", "", "", null, null, ""],
];
poSheet.getRange("A5:J17").values = sampleRows;
poSheet.getRange("A5:A1000").format.numberFormat = [["yyyy-mm-dd"]];
poSheet.getRange("H5:I1000").format.numberFormat = [["#,##0"]];
poSheet.getRange("A4:J1000").format.wrapText = true;
applyBorders(poSheet.getRange("A4:J1000"));
poSheet.freezePanes.freezeRows(4);
poSheet.freezePanes.freezeColumns(2);

const categoryValidation = poSheet.getRange("C5:C1000").dataValidation;
categoryValidation.rule = {
  list: {
    inCellDropDown: true,
    source: "=Setup!$A$2:$A$8",
  },
};

const spendTypeValidation = poSheet.getRange("D5:D1000").dataValidation;
spendTypeValidation.rule = {
  list: {
    inCellDropDown: true,
    source: "=Setup!$G$2:$G$9",
  },
};

const statusValidation = poSheet.getRange("J5:J1000").dataValidation;
statusValidation.rule = {
  list: {
    inCellDropDown: true,
    source: "=Setup!$E$2:$E$6",
  },
};

poSheet.getRange("L4:M9").values = [
  ["Quick Notes", "How to use"],
  ["1", "Enter every new PO in the next blank row."],
  ["2", "Choose the category and spend type from the dropdowns."],
  ["3", "Update status as it moves from Raised to Paid."],
  ["4", "Add invoice amount when the vendor invoice arrives."],
  ["5", "Dashboard updates automatically."],
];
styleSubHeader(poSheet.getRange("L4:M4"));
poSheet.getRange("L4:M9").format.wrapText = true;
applyBorders(poSheet.getRange("L4:M9"));

poSheet.getRange("A:J").format.autofitColumns();
poSheet.getRange("E:E").columnWidth = 220;
poSheet.getRange("F:F").columnWidth = 160;
poSheet.getRange("L:M").format.autofitColumns();

const dashboard = workbook.worksheets.add("Dashboard");
dashboard.getRange("A1:H2").merge();
dashboard.getRange("A1").value = "Annual Marketing Budget Dashboard";
dashboard.getRange("A1").format.fill.color = titleFill;
dashboard.getRange("A1").format.font.color = white;
dashboard.getRange("A1").format.font.bold = true;
dashboard.getRange("A1").format.font.size = 16;

dashboard.getRange("A4:B8").values = [
  ["Metric", "Value"],
  ["Total Budget", '=SUM(Setup!$B$2:$B$8)'],
  ["PO Value Raised", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")'],
  ["Invoices Logged", '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")'],
  ["Remaining Budget", "=B5-B6"],
];
styleHeader(dashboard.getRange("A4:B4"));
styleSubHeader(dashboard.getRange("A5:A8"));
dashboard.getRange("B5:B8").format.numberFormat = [["#,##0"]];
dashboard.getRange("A4:B8").format.font.size = 11;
applyBorders(dashboard.getRange("A4:B8"));

dashboard.getRange("D4:I11").values = [
  ["Category", "Annual Budget", "PO Raised", "Invoiced", "Remaining", "Utilization %"],
  ["Apparel", '=XLOOKUP(D5,Setup!$A$2:$A$8,Setup!$B$2:$B$8)', '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$C$5:$C$1000,D5,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$C$5:$C$1000,D5,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', "=E5-F5", '=IF(E5=0,"",F5/E5)'],
  ["Footwear", '=XLOOKUP(D6,Setup!$A$2:$A$8,Setup!$B$2:$B$8)', '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$C$5:$C$1000,D6,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$C$5:$C$1000,D6,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', "=E6-F6", '=IF(E6=0,"",F6/E6)'],
  ["Massage Oils", '=XLOOKUP(D7,Setup!$A$2:$A$8,Setup!$B$2:$B$8)', '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$C$5:$C$1000,D7,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$C$5:$C$1000, D7,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', "=E7-F7", '=IF(E7=0,"",F7/E7)'],
  ["Accessories", '=XLOOKUP(D8,Setup!$A$2:$A$8,Setup!$B$2:$B$8)', '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$C$5:$C$1000,D8,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$C$5:$C$1000,D8,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', "=E8-F8", '=IF(E8=0,"",F8/E8)'],
  ["Indoor Equipment", '=XLOOKUP(D9,Setup!$A$2:$A$8,Setup!$B$2:$B$8)', '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$C$5:$C$1000,D9,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$C$5:$C$1000,D9,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', "=E9-F9", '=IF(E9=0,"",F9/E9)'],
  ["Cycles", '=XLOOKUP(D10,Setup!$A$2:$A$8,Setup!$B$2:$B$8)', '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$C$5:$C$1000,D10,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$C$5:$C$1000,D10,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', "=E10-F10", '=IF(E10=0,"",F10/E10)'],
  ["Other", '=XLOOKUP(D11,Setup!$A$2:$A$8,Setup!$B$2:$B$8)', '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$C$5:$C$1000,D11,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$C$5:$C$1000,D11,\'PO Log\'!$J$5:$J$1000,"<>Cancelled")', "=E11-F11", '=IF(E11=0,"",F11/E11)'],
];
styleHeader(dashboard.getRange("D4:I4"));
dashboard.getRange("E5:H11").format.numberFormat = [["#,##0"]];
dashboard.getRange("I5:I11").format.numberFormat = [["0%"]];
dashboard.getRange("D4:I11").format.wrapText = true;
applyBorders(dashboard.getRange("D4:I11"));

dashboard.getRange("A10:B15").values = [
  ["Status", "Open Value"],
  ["Draft", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$J$5:$J$1000,A11)'],
  ["Raised", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$J$5:$J$1000,A12)'],
  ["Invoiced", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$J$5:$J$1000,A13)'],
  ["Paid", '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$J$5:$J$1000,A14)'],
  ["Cancelled", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$J$5:$J$1000,A15)'],
];
styleHeader(dashboard.getRange("A10:B10"));
dashboard.getRange("B11:B15").format.numberFormat = [["#,##0"]];
applyBorders(dashboard.getRange("A10:B15"));

dashboard.getRange("D13:F18").values = [
  ["Top Vendors", "Raised Amount", "Invoiced Amount"],
  ["Alpha Talent", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$F$5:$F$1000,D14)', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$F$5:$F$1000,D14)'],
  ["LiveWire Events", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$F$5:$F$1000,D15)', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$F$5:$F$1000,D15)'],
  ["UrbanPedal", '=SUMIFS(\'PO Log\'!$H$5:$H$1000,\'PO Log\'!$F$5:$F$1000,D16)', '=SUMIFS(\'PO Log\'!$I$5:$I$1000,\'PO Log\'!$F$5:$F$1000,D16)'],
  ["", "", ""],
  ["", "", ""],
];
styleHeader(dashboard.getRange("D13:F13"));
dashboard.getRange("E14:F18").format.numberFormat = [["#,##0"]];
applyBorders(dashboard.getRange("D13:F18"));

dashboard.getRange("A4:I18").format.font.name = "Aptos";
dashboard.getRange("A:I").format.autofitColumns();
dashboard.getRange("A:A").columnWidth = 130;
dashboard.getRange("D:D").columnWidth = 150;
dashboard.getRange("E:I").columnWidth = 110;
dashboard.freezePanes.freezeRows(4);

// Soft visual cues for dashboard and entry sheet.
dashboard.getRange("A5:B8").format.fill.color = accentFill;
dashboard.getRange("A10:B15").format.fill.color = warnFill;

const chart = dashboard.charts.add("ColumnClustered", dashboard.getRange("D4:F11"), "Auto");
chart.title.text = "Budget vs PO Raised vs Invoiced";
chart.setPosition(dashboard.getRange("K4:R18"));
chart.width = 620;
chart.height = 290;
chart.legend.position = "bottom";

await fs.mkdir(outputDir, { recursive: true });

const dashboardCheck = await workbook.inspect({
  kind: "table",
  range: "Dashboard!A4:I11",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 12,
});
console.log(dashboardCheck.ndjson);

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
});
console.log(errorScan.ndjson);

await workbook.render({ sheetName: "Setup", range: "A1:G10", scale: 1.5 });
await workbook.render({ sheetName: "PO Log", range: "A1:M18", scale: 1.5 });
await workbook.render({ sheetName: "Dashboard", range: "A1:R18", scale: 1.5 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(`Saved workbook to ${outputPath}`);
