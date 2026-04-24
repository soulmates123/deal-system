const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const dataDir = path.join(__dirname, "data");
const itemExcelPath = findDataFile("c_items");
const serviceExcelPath = findDataFile("c_servicecharge");
const departmentTaskExcelPath = findDataFile("depatmenttask");
const outputPath = path.join(dataDir, "items-data.js");

const ITEM_COL_MAP = {
  seq: 0,
  name: 1,
  category: 2,
  quality: 3,
  length: 5,
  width: 6,
  initialPrice: 8,
  sellPrice: 11,
  priceLower: 13,
  priceUpper: 14,
  minDeposit: 15,
  description: 17
};

const SERVICE_COL_MAP = {
  feeIndex: 0,
  feeRate: 1
};

function toText(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (typeof value === "number") return value;

  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function toPercent(value) {
  if (typeof value === "number") {
    return value > 1 ? value / 100 : value;
  }

  const cleaned = String(value ?? "")
    .replace(/%/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;

  return num > 1 ? num / 100 : num;
}

function toMixedValue(value) {
  if (value === "" || value == null) return "";
  if (typeof value === "number") return value;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!cleaned) return "";

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : toText(value);
}

function findDataFile(keyword) {
  const lowerKeyword = String(keyword || "").toLowerCase();
  const fileName = fs.readdirSync(dataDir).find(file => (
    file.toLowerCase().includes(lowerKeyword) &&
    file.toLowerCase().endsWith(".xlsx")
  ));

  if (!fileName) {
    throw new Error(`找不到数据文件：${keyword}`);
  }

  return path.join(dataDir, fileName);
}

function readSheetRows(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到文件：${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: ""
  });
}

function parseItemRows(rows) {
  const dataRows = rows.slice(1);

  return dataRows
    .filter(row => row && row[ITEM_COL_MAP.name])
    .map((row, index) => ({
      id: String(row[ITEM_COL_MAP.seq] || index + 1),
      seq: toNumber(row[ITEM_COL_MAP.seq]) || index + 1,
      name: toText(row[ITEM_COL_MAP.name]),
      category: toText(row[ITEM_COL_MAP.category]),
      quality: toText(row[ITEM_COL_MAP.quality]),
      length: toNumber(row[ITEM_COL_MAP.length]),
      width: toNumber(row[ITEM_COL_MAP.width]),
      buyPrice: toNumber(row[ITEM_COL_MAP.initialPrice]),
      initialPrice: toNumber(row[ITEM_COL_MAP.initialPrice]),
      sellPrice: toNumber(row[ITEM_COL_MAP.sellPrice]),
      priceLower: toNumber(row[ITEM_COL_MAP.priceLower]),
      priceUpper: toNumber(row[ITEM_COL_MAP.priceUpper]),
      minDeposit: toNumber(row[ITEM_COL_MAP.minDeposit]),
      description: toText(row[ITEM_COL_MAP.description])
    }));
}

function parseServiceRows(rows) {
  const dataRows = rows.slice(1);

  return dataRows
    .filter(row => {
      const idx = row[SERVICE_COL_MAP.feeIndex];
      const rate = row[SERVICE_COL_MAP.feeRate];
      return idx !== "" && idx != null && rate !== "" && rate != null;
    })
    .map(row => ({
      feeIndex: toNumber(row[SERVICE_COL_MAP.feeIndex]),
      feeRate: toPercent(row[SERVICE_COL_MAP.feeRate])
    }))
    .filter(row => row.feeIndex > 0 && row.feeRate > 0)
    .sort((a, b) => a.feeIndex - b.feeIndex);
}

function parseDepartmentTaskRows(rows) {
  const dataRows = rows.slice(2);
  let currentDepartment = "";

  return dataRows
    .filter(row => row && row[1] !== "" && row[1] != null)
    .map((row, index) => {
      const department = toText(row[0]) || currentDepartment;
      currentDepartment = department || currentDepartment;

      const rewards = [];
      for (let col = 9; col < row.length; col += 2) {
        const rewardName = toText(row[col]);
        const rewardAmount = toMixedValue(row[col + 1]);

        if (!rewardName) continue;

        rewards.push({
          name: rewardName,
          amount: rewardAmount
        });
      }

      return {
        id: String(row[1] || index + 1),
        seq: index + 1,
        department,
        taskId: String(row[1] || index + 1),
        name: toText(row[2]),
        type: toText(row[3]),
        preTaskId: toText(row[4]),
        map: toText(row[5]),
        description: toText(row[6]),
        target: toText(row[7]),
        targetCount: toMixedValue(row[8]),
        rewards
      };
    });
}

function run() {
  const itemRows = readSheetRows(itemExcelPath);
  const serviceRows = readSheetRows(serviceExcelPath);
  const departmentTaskRows = readSheetRows(departmentTaskExcelPath);

  const items = parseItemRows(itemRows);
  const serviceChargeData = parseServiceRows(serviceRows);
  const departmentTaskData = parseDepartmentTaskRows(departmentTaskRows);

  const content =
`window.ITEMS_DATA = ${JSON.stringify(items, null, 2)};
window.SERVICE_CHARGE_DATA = ${JSON.stringify(serviceChargeData, null, 2)};
window.DEPARTMENT_TASK_DATA = ${JSON.stringify(departmentTaskData, null, 2)};
`;

  fs.writeFileSync(outputPath, content, "utf8");

  console.log(`[OK] 已生成静态数据文件：${outputPath}`);
  console.log(`[OK] 物品数据：${items.length} 条`);
  console.log(`[OK] 手续费规则：${serviceChargeData.length} 条`);
  console.log(`[OK] 部门任务：${departmentTaskData.length} 条`);
}

run();
