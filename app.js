/* =========================================================
 * 交易行系统 - 主逻辑文件 app.js
 *
 * 当前版本包含：
 * 1. 购买页：按静态价格购买物品，购买后直接进入仓库
 * 2. 仓库页：查看库存、系统回收出售、跳转到交易行出售页
 * 3. 交易行出售页：
 *    - 左侧显示已上架物品和槽位
 *    - 右侧显示仓库中可上架的物品
 *    - 点击物品卡片可打开上架编辑器
 * 4. 上架编辑器：
 *    - 数量不能超过仓库库存
 *    - 价格支持加减微调
 *    - 价格低于最低售价时会自动修正
 *    - 可展开查看手续费、保证金和预计收益
 * 5. 交易记录页
 * 6. 顶部手动增加金币
 *
 * ---------------------------------------------------------
 * 当前确认过的核心计算规则：
 *
 * 设：
 *   a = 玩家输入的单件上架价格
 *   q = 上架数量
 *
 * 注意：
 * - 多件上架时，不是直接用 (a * q) 去重新判定手续费率
 * - 而是先按单件计算，再把结果乘以上架数量
 * - 同一种物品一次上架多件，本质上只是减少重复操作
 * - 每个挂单最终仍然只占用 1 个槽位
 *
 * 单件计算：
 *   单件保证金 = max(最低保证金, a * 3%)
 *   手续费序号 = floor(round(a / 单件保证金, 0) / 10)
 *   单件手续费率 = 手续费表[手续费序号]
 *   单件手续费 = a * 单件手续费率
 *   单件预期收入 = a - 单件保证金 - 单件手续费
 *
 * 合计展示：
 *   出售总价 = a * q
 *   总保证金 = 单件保证金 * q
 *   总手续费 = 单件手续费 * q
 *   总预期收入 = 单件预期收入 * q
 * ========================================================= */

/* =========================================================
 * 一、本地存储 key
 * 用来把金币、仓库库存、交易记录和上架列表保存到浏览器本地
 * ========================================================= */
const STORAGE_KEYS = {
  gold: "trade_static_gold",
  inventory: "trade_static_inventory",
  records: "trade_static_records",
  listings: "trade_static_listings",
  listingSlotLimit: "trade_static_listing_slot_limit"
};


/* =========================================================
 * 二、基础常量
 * ========================================================= */

// 顶部“金币”输入框默认值
const DEFAULT_ADD_GOLD = 10000000;

// 最大同时上架位
const DEFAULT_LISTING_SLOTS = 10;
const LISTING_SLOT_PRICE = 10000000;
const LISTING_DURATION_MS = 24 * 60 * 60 * 1000;
const LISTING_PRICE_BAR_COUNT = 9;
const LISTING_PRICE_VISIBLE_BAR_COUNT = 5;
const LISTING_PRICE_BAR_CENTER_INDEX = 4;
const LISTING_PRICE_BAR_INTERVAL_RATE = 0.0033554794980203;
const LISTING_SYSTEM_RECYCLE_FAST_MS = 10 * 1000;
const LISTING_SYSTEM_RECYCLE_CENTER_MS = 5 * 60 * 1000;

// 品质排序：红 -> 金 -> 紫 -> 蓝 -> 绿 -> 白
const QUALITY_SORT_ORDER = {
  "红": 0,
  "金": 1,
  "紫": 2,
  "蓝": 3,
  "绿": 4,
  "白": 5
};


/* =========================================================
 * 三、基础工具函数
 * ========================================================= */

/**
 * 简写 document.getElementById
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * 安全绑定事件
 * 如果元素不存在，不会报错
 */
function bind(id, eventName, handler) {
  const el = $(id);
  if (el) {
    el.addEventListener(eventName, handler);
  }
}

/**
 * 金额格式化
 * 例如：1000000 -> 1,000,000
 */
function formatMoney(num) {
  return Number(num || 0).toLocaleString("zh-CN");
}

/**
 * 转字符串并去掉前后空格
 */
function toText(value) {
  return String(value ?? "").trim();
}

/**
 * 转数字
 * 会自动去掉逗号和空格，兼容 Excel 导出格式
 */
function toNumber(value) {
  if (typeof value === "number") return value;

  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function toMixedValue(value) {
  if (value === "" || value == null) return "";
  if (typeof value === "number") return value;

  const text = toText(value);
  if (!text) return "";

  const normalized = text.replace(/,/g, "");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : text;
}

/**
 * 限制数值在 min ~ max 之间
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return map[char] || char;
  });
}

function formatMixedValue(value) {
  if (typeof value === "number") return formatMoney(value);
  return toText(value) || "-";
}

function inferRecordSide(type) {
  if (type === "购买") return "buy";
  if (type === "出售") return "sell";
  return "system";
}

function parseStoredTimeMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return 0;

  const text = String(value).trim();
  if (!text) return 0;

  const normalized = text.replace(/[^\d:/.\-\s]/g, " ").replace(/\./g, "-").replace(/\s+/g, " ").trim();
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(value) {
  const timeMs = parseStoredTimeMs(value) || Date.now();
  const date = new Date(timeMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

function formatCountdown(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function createRecordEntry(type, itemName, price, count, extra = {}) {
  const timeMs = Number(extra.timeMs) || Date.now();

  return {
    type,
    side: extra.side || inferRecordSide(type),
    itemId: extra.itemId ? String(extra.itemId) : "",
    itemName,
    category: extra.category || "",
    quality: extra.quality || "",
    price,
    count,
    timeMs,
    time: extra.time || formatDateTime(timeMs)
  };
}

function normalizeRecords(records) {
  return (Array.isArray(records) ? records : []).map(record => {
    if (!record) return null;

    const timeMs = parseStoredTimeMs(record.timeMs || record.time);
    return {
      ...record,
      side: record.side || inferRecordSide(record.type),
      itemId: record.itemId ? String(record.itemId) : "",
      category: record.category || "",
      quality: record.quality || "",
      price: toNumber(record.price),
      count: Math.max(1, toNumber(record.count) || 1),
      timeMs: timeMs || Date.now(),
      time: record.time || formatDateTime(timeMs || Date.now())
    };
  }).filter(Boolean);
}

function normalizeListingTimestamps(listing) {
  const createdAtTs = parseStoredTimeMs(listing.createdAtTs || listing.createdAt) || Date.now();
  const expireAtTs = parseStoredTimeMs(listing.expireAtTs) || (createdAtTs + LISTING_DURATION_MS);

  return {
    ...listing,
    createdAtTs,
    expireAtTs,
    createdAt: listing.createdAt || formatDateTime(createdAtTs)
  };
}

function getListingExpireRemainingMs(listing, now = Date.now()) {
  const expireAtTs = parseStoredTimeMs(listing?.expireAtTs);
  if (!expireAtTs) return 0;
  return Math.max(0, expireAtTs - now);
}

/**
 * 生成一个挂单 id
 */
function makeListingId() {
  return `listing_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

/**
 * 获取品质排序值
 * 未知品质默认排到最后
 */
function getQualitySortValue(quality) {
  return QUALITY_SORT_ORDER[quality] ?? 999;
}

// 兼容旧存档：把历史上“quantity > 1 的合并挂单”拆成多个单件挂单。
// 这样左侧架子始终按 1 件 1 卡展示，后续的上架和下架逻辑也更统一。
function normalizeListings(listings) {
  if (!Array.isArray(listings)) return [];

  const normalized = [];

  listings.forEach((listing, index) => {
    if (!listing) return;

    const normalizedListing = normalizeListingTimestamps(listing);

    const quantity = Math.max(1, Math.floor(toNumber(normalizedListing.quantity) || 1));
    const listingIdBase = String(normalizedListing.listingId || `legacy_listing_${index + 1}`);
    const perItemPrice = toNumber(normalizedListing.perItemPrice) || Math.round(toNumber(normalizedListing.totalPrice) / quantity);
    const perItemDeposit = toNumber(normalizedListing.perItemDeposit) || Math.round(toNumber(normalizedListing.deposit) / quantity);
    const perItemFee = toNumber(normalizedListing.perItemFee) || Math.round(toNumber(normalizedListing.fee) / quantity);
    const perItemExpectedReceive =
      toNumber(normalizedListing.perItemExpectedReceive) || Math.round(toNumber(normalizedListing.expectedReceive) / quantity);

    for (let i = 0; i < quantity; i += 1) {
      normalized.push({
        ...normalizedListing,
        listingId: quantity === 1 ? listingIdBase : `${listingIdBase}_${i + 1}`,
        quantity: 1,
        perItemPrice,
        perItemDeposit,
        perItemFee,
        perItemExpectedReceive,
        totalPrice: perItemPrice,
        deposit: perItemDeposit,
        fee: perItemFee,
        expectedReceive: perItemExpectedReceive
      });
    }
  });

  return normalized.map(normalizeListingTimestamps);
}

function getListingSlotLimit() {
  return Math.max(DEFAULT_LISTING_SLOTS, toNumber(state.listingSlotLimit) || DEFAULT_LISTING_SLOTS);
}

function renderListingSlotLimitTip() {
  const tipEl = $("listingSlotLimitTip");
  if (!tipEl) return;

  tipEl.textContent = `最多同时上架 ${getListingSlotLimit()} 个商品`;
}

function confirmListing() {}

function renderListingShelf() {}

/* =========================================================
 * 四、全局状态 state
 * ========================================================= */

const state = {
  // 从 items-data.js 读出来的物品表
  items: [],

  // 从 items-data.js 读出来的手续费规则表
  serviceChargeRules: [],

  // 当前金币
  gold: Number(localStorage.getItem(STORAGE_KEYS.gold)) || 314381,

  // 仓库库存
  // 结构：{ itemId: count, ... }
  inventory: JSON.parse(localStorage.getItem(STORAGE_KEYS.inventory) || "{}"),

  // 交易记录
  records: normalizeRecords(JSON.parse(localStorage.getItem(STORAGE_KEYS.records) || "[]")),

  // 当前挂单列表
  // 一个挂单占一个槽位
  listings: normalizeListings(JSON.parse(localStorage.getItem(STORAGE_KEYS.listings) || "[]")),

  listingSlotLimit: Math.max(
    DEFAULT_LISTING_SLOTS,
    Number(localStorage.getItem(STORAGE_KEYS.listingSlotLimit)) || DEFAULT_LISTING_SLOTS
  ),

  departmentTasks: [],

  // 当前主视图：trade / warehouse / department
  currentView: "trade",

  currentDepartment: "",
  selectedDepartmentTaskId: "",

  // 当前交易行页签：buy / sell / record
  currentTab: "buy",

  // 左侧筛选条件
  currentCategory: "",
  currentQuality: "",
  keyword: "",

  // 通用弹窗“确认”按钮的回调
  modalConfirmHandler: null,

  // 当前上架编辑器草稿
  // 结构示例：
  // {
  //   itemId: "1001",
  //   quantity: 1,
  //   currentPrice: 326505,
  //   showDetail: false
  // }
  listingDraft: null,
  activeListingDetailId: "",
  listingTicker: null,

  // 部门任务视角拖拽状态
  departmentViewport: {
    department: "",
    initialized: false,
    offsetX: 0,
    offsetY: 0,
    contentWidth: 0,
    contentHeight: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragOriginX: 0,
    dragOriginY: 0
  }
};


/* =========================================================
 * 五、本地持久化
 * ========================================================= */

/**
 * 把当前金币、仓库、记录和挂单保存到浏览器本地
 */
function saveState() {
  localStorage.setItem(STORAGE_KEYS.gold, state.gold);
  localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(state.inventory));
  localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(state.records));
  localStorage.setItem(STORAGE_KEYS.listings, JSON.stringify(state.listings));
  localStorage.setItem(STORAGE_KEYS.listingSlotLimit, String(getListingSlotLimit()));
}


/* =========================================================
 * 六、数据规范化
 * 从 items-data.js 读到的全局变量里整理成前端统一结构
 * ========================================================= */

/**
 * 规范化物品表
 * 让每个物品至少具备这些字段：
 * id / seq / name / category / quality / buyPrice / initialPrice / sellPrice / minDeposit
 */
function normalizeItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && item.name)
    .map((item, index) => ({
      id: String(item.id || item.seq || index + 1),
      seq: toNumber(item.seq) || index + 1,
      name: toText(item.name),
      category: toText(item.category),
      quality: toText(item.quality),

      // 鏂板瀛楁
      length: toNumber(item.length),
      width: toNumber(item.width),
      priceLower: toNumber(item.priceLower),
      priceUpper: toNumber(item.priceUpper),
      description: toText(item.description),

      buyPrice: toNumber(item.buyPrice),
      initialPrice: toNumber(item.initialPrice || item.buyPrice),
      sellPrice: toNumber(item.sellPrice),
      minDeposit: toNumber(item.minDeposit)
    }));
}

/**
 * 瑙勮寖鍖栨墜缁垂瑙勫垯琛?
 * feeRate 如果是 15.58 这种值，就转换成 0.1558
 */
function normalizeServiceChargeRules(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map(rule => {
      const rawRate = toNumber(rule.feeRate);

      return {
        feeIndex: toNumber(rule.feeIndex),
        feeRate: rawRate > 1 ? rawRate / 100 : rawRate
      };
    })
    .filter(rule => rule.feeIndex > 0)
    .sort((a, b) => a.feeIndex - b.feeIndex);
}

function normalizeDepartmentTasks(tasks) {
  let lastDepartment = "";

  return (Array.isArray(tasks) ? tasks : [])
    .filter(task => task && (task.taskId || task.id))
    .map((task, index) => {
      const department = toText(task.department) || lastDepartment || "未命名部门";
      lastDepartment = department;

      const rewards = (Array.isArray(task.rewards) ? task.rewards : [])
        .map((reward, rewardIndex) => ({
          id: `${task.taskId || task.id || index + 1}_reward_${rewardIndex + 1}`,
          name: toText(reward?.name),
          amount: toMixedValue(reward?.amount)
        }))
        .filter(reward => reward.name);

      return {
        id: String(task.id || task.taskId || index + 1),
        seq: toNumber(task.seq) || index + 1,
        department,
        taskId: String(task.taskId || task.id || index + 1),
        name: toText(task.name) || `任务 ${index + 1}`,
        type: toText(task.type) || "普通任务",
        preTaskId: toText(task.preTaskId),
        map: toText(task.map) || "未知地图",
        description: toText(task.description) || "暂无任务描述",
        target: toText(task.target) || "暂无任务目标",
        targetCount: toMixedValue(task.targetCount),
        rewards
      };
    });
}

/**
 * 根据手续费序号拿手续费率
 * 如果刚好有对应序号，直接返回
 * 如果没有对应项：
 * - 小于最小序号：返回第一档
 * - 大于最大序号：返回最后一档
 */
function getFeeRateByIndex(feeIndex) {
  const rules = state.serviceChargeRules;

  // 如果手续费表没读到，直接报错提示
  if (!rules.length) {
    console.warn("[手续费规则为空] state.serviceChargeRules 没有读到数据");
    return 0;
  }

  const exact = rules.find(rule => rule.feeIndex === feeIndex);
  if (exact) return exact.feeRate;

  if (feeIndex <= rules[0].feeIndex) {
    return rules[0].feeRate;
  }

  return rules[rules.length - 1].feeRate;
}


/* =========================================================
 * 七、价格相关规则
 * ========================================================= */

/**
 * 参考价格
 * 优先使用初始定价 initialPrice
 */
function getReferencePrice(item) {
  return item.initialPrice || item.buyPrice || 0;
}

/**
 * 最低可上架价格 = 初始定价 * 15%
 */
function getMinListPrice(item) {
  return Math.max(1, Math.round(getReferencePrice(item) * 0.15));
}

/**
 * 最高可上架价格 = 初始定价 * 1500%
 * 鍗?* 15
 */
function getMaxListPrice(item) {
  return Math.max(getMinListPrice(item), Math.round(getReferencePrice(item) * 15));
}

/**
 * 当前已使用售位
 * 现在直接等于挂单数量
 */
function getUsedListingSlots() {
  return state.listings.reduce((sum, listing) => sum + Math.max(0, toNumber(listing.quantity)), 0);
}

function getAvailableListingSlots() {
  return Math.max(0, getListingSlotLimit() - getUsedListingSlots());
}

function getItemById(itemId) {
  return state.items.find(item => item.id === String(itemId)) || null;
}

function getListingItem(listing) {
  return getItemById(listing?.itemId) || {
    id: listing?.itemId || "",
    name: listing?.name || "未知物品",
    category: listing?.category || "",
    quality: listing?.quality || "",
    buyPrice: toNumber(listing?.perItemPrice),
    initialPrice: toNumber(listing?.perItemPrice),
    priceLower: 0,
    priceUpper: 0,
    minDeposit: toNumber(listing?.perItemDeposit)
  };
}

function getRecordItem(record) {
  if (record?.itemId) {
    const item = getItemById(record.itemId);
    if (item) return item;
  }

  return state.items.find(item => item.name === record?.itemName) || null;
}

function removeExpiredListings(now = Date.now()) {
  const expiredListings = [];
  const recycledListings = [];

  state.listings.forEach(listing => {
    const lifecycle = getListingLifecycleResult(listing, now);
    if (lifecycle.status === "expired") {
      expiredListings.push(listing);
    } else if (lifecycle.status === "systemRecycle") {
      recycledListings.push(listing);
    }
  });

  if (!expiredListings.length && !recycledListings.length) return false;

  const removedIds = new Set(
    expiredListings.concat(recycledListings).map(listing => listing.listingId)
  );

  expiredListings.forEach(listing => {
    state.inventory[listing.itemId] = (state.inventory[listing.itemId] || 0) + Math.max(1, toNumber(listing.quantity) || 1);
    state.records.unshift(createRecordEntry("过期下架", listing.name, listing.perItemPrice, listing.quantity, {
      itemId: listing.itemId,
      category: listing.category,
      quality: listing.quality,
      side: "system",
      timeMs: now
    }));
  });

  recycledListings.forEach(listing => {
    const settledGold = Math.max(0, toNumber(listing.totalPrice) - toNumber(listing.fee));
    state.gold += settledGold;
    state.records.unshift(createRecordEntry("系统回收", listing.name, settledGold, listing.quantity, {
      itemId: listing.itemId,
      category: listing.category,
      quality: listing.quality,
      side: "sell",
      timeMs: now
    }));
  });

  state.listings = state.listings.filter(listing => !removedIds.has(listing.listingId));

  if (state.activeListingDetailId && removedIds.has(state.activeListingDetailId)) {
    closeListingView();
  }

  saveState();
  return true;
}

function tickListingLifecycle() {
  const changed = removeExpiredListings();
  if (changed) {
    renderAll();
    return;
  }

  renderListingShelf();
  renderListingDetailView();
}

function startListingTicker() {
  if (state.listingTicker) {
    clearInterval(state.listingTicker);
  }

  state.listingTicker = setInterval(() => {
    tickListingLifecycle();
  }, 1000);
}

function buyListingSlot() {
  if (state.gold < LISTING_SLOT_PRICE) {
    showMessageModal("金币不足", `购买 1 个槽位需要 ${formatMoney(LISTING_SLOT_PRICE)} 金币。`);
    return;
  }

  state.gold -= LISTING_SLOT_PRICE;
  state.listingSlotLimit = getListingSlotLimit() + 1;
  saveState();
  renderAll();

  showMessageModal("购买成功", `已增加 1 个槽位。\n当前槽位：${getUsedListingSlots()}/${getListingSlotLimit()}`);
}

/* =========================================================
 * 八、核心计算：上架信息
 *
 * 按当前确认的规则：
 * - a = 玩家输入的单件上架价格
 * - q = 上架数量
 * - 多件上架时，先按单件计算，再乘以上架数量
 * ========================================================= */
function calculateListingInfo(item, currentPrice, quantity = 1) {
  const referencePrice = getReferencePrice(item);
  const minPrice = getMinListPrice(item);
  const maxPrice = getMaxListPrice(item);

  const fixedPrice = clamp(Math.round(currentPrice), minPrice, maxPrice);
  const isPriceValid = fixedPrice >= minPrice && fixedPrice <= maxPrice;

  /* -------------------------
   * 单件计算
   * ------------------------- */
  const perItemPrice = fixedPrice;

  // 实际保证金（上架时收取）
  // 规则不变：max(最低保证金, 当前出售价格 * 3%)
  const perItemDeposit = Math.max(
    toNumber(item.minDeposit),
    Math.round(perItemPrice * 0.03)
  );

  // 手续费横轴专用基数
  // 新规则：max(最低售价 * 3%, 最低保证金)
  const feeAxisDepositBase = Math.max(
    Math.round(minPrice * 0.03),
    toNumber(item.minDeposit)
  );

  // 手续费横轴 = round(出售价格 / max(最低售价 * 3%，最低保证金), 1)
  const feeAxis = Number((perItemPrice / feeAxisDepositBase).toFixed(1));

  // 手续费序号
  const feeIndex = Math.max(1, Math.floor(feeAxis / 10));

  // 单件手续费率
  const feeRate = getFeeRateByIndex(feeIndex);

  // 单件手续费
  const perItemFee = Math.round(perItemPrice * feeRate);

  // 单件预期收入
  const perItemExpectedReceive = perItemPrice - perItemDeposit - perItemFee;

  /* -------------------------
   * 合计展示
   * ------------------------- */
  const totalPrice = perItemPrice * quantity;
  const totalDeposit = perItemDeposit * quantity;
  const totalFee = perItemFee * quantity;
  const expectedReceive = perItemExpectedReceive * quantity;
  const usedSlots = getUsedListingSlots();
  const availableSlots = Math.max(0, getListingSlotLimit() - usedSlots);

  return {
    item,
    quantity,
    stockCount: state.inventory[item.id] || 0,
    usedSlots,
    slotsToUse: quantity,
    availableSlots,
    maxSlots: getListingSlotLimit(),

    referencePrice,
    currentPrice: fixedPrice,
    minPrice,
    maxPrice,
    isPriceValid,

    // 单件数据
    perItemPrice,
    perItemDeposit,
    perItemFee,
    perItemExpectedReceive,

    // 手续费判定过程数据
    feeAxis,
    feeIndex,
    feeRate,

    // 合计数据（界面显示用）
    totalPrice,
    deposit: totalDeposit,
    fee: totalFee,
    expectedReceive
  };
}
/**
 * 生成变化曲线数据
 * 横轴：价格区间（最低价 -> 最高价）
 * 纵轴：在当前数量下的
 * - 预计收入
 * - 保证金
 * - 手续费
 */
function buildTrendData(item, quantity = 1) {
  const minPrice = getMinListPrice(item);
  const maxPrice = getMaxListPrice(item);

  const points = [];

  // 从最低价开始
  let currentPrice = minPrice;

  // 防止异常死循环
  let guard = 0;
  const maxGuard = 10000;

  while (currentPrice <= maxPrice && guard < maxGuard) {
    const info = calculateListingInfo(item, currentPrice, quantity);
    const totalPrice = info.totalPrice || 1;

    points.push({
      price: info.currentPrice,
      feeAxis: Number(info.feeAxis.toFixed(1)),

      // 纵轴用比例（0~1）
      incomeRate: info.expectedReceive / totalPrice,
      feeRateLine: info.fee / totalPrice,
      depositRate: info.deposit / totalPrice
    });

    // 下一个价格 = 上一个价格 * 1.01
    let nextPrice = Math.round(currentPrice * 1.01);

    // 防止四舍五入后价格不变，导致死循环
    if (nextPrice <= currentPrice) {
      nextPrice = currentPrice + 1;
    }

    // 如果已经快超过最大价，就最后补一个最大价
    if (nextPrice > maxPrice) {
      if (currentPrice !== maxPrice) {
        currentPrice = maxPrice;
      } else {
        break;
      }
    } else {
      currentPrice = nextPrice;
    }

    guard += 1;
  }

  // 如果最后一个点不是最高价，再补一个最高价
  if (!points.length || points[points.length - 1].price !== maxPrice) {
    const lastInfo = calculateListingInfo(item, maxPrice, quantity);
    const totalPrice = lastInfo.totalPrice || 1;

    points.push({
      price: lastInfo.currentPrice,
      feeAxis: Number(lastInfo.feeAxis.toFixed(1)),
      incomeRate: lastInfo.expectedReceive / totalPrice,
      feeRateLine: lastInfo.fee / totalPrice,
      depositRate: lastInfo.deposit / totalPrice
    });
  }

  return points;
}
/**
 * 绘制变化曲线弹窗里的 canvas
 * 三条线分别表示：
 * - 预计收入
 * - 手续费
 * - 保证金
 */
function renderTrendModalChart(info) {
  const canvas = $("trendChartCanvas");
  if (!canvas) return;

  const wrap = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!ctx || !wrap) return;

  // 这里不再抽样，直接使用全部真实点位
  const points = buildTrendData(info.item, info.quantity);
  if (!points.length) return;

  // 每个点占用的横向宽度
  // 想看得更开可以调大，比如 24 / 26
  const pointSpacing = 20;

  const dpr = window.devicePixelRatio || 1;
  const baseHeight = wrap.clientHeight || 560;

  const padding = {
    top: 24,
    right: 30,
    bottom: 90,
    left: 80
  };

  // 关键：画布宽度跟点数走，确保 464 个点都能展开
  const chartWidth = Math.max(
    wrap.clientWidth,
    padding.left + padding.right + (points.length - 1) * pointSpacing + 40
  );

  const chartHeight = baseHeight;

  canvas.width = Math.floor(chartWidth * dpr);
  canvas.height = Math.floor(chartHeight * dpr);

  // 璁?CSS 瑙嗚灏哄鍜屽疄闄呭楂樹竴鑷?
  canvas.style.width = `${chartWidth}px`;
  canvas.style.height = `${chartHeight}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, chartWidth, chartHeight);

  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // 横坐标按“点序列”排，每个点都占一个位置
  function getX(index) {
    return padding.left + index * pointSpacing;
  }

  // 绾靛潗鏍囧浐瀹?0~100%
  function getY(value) {
    const ratio = value / 1;
    return padding.top + plotHeight - ratio * plotHeight;
  }

  // =========================
  // 背景横线：0% ~ 100%
  // =========================
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;

  for (let i = 0; i <= 5; i += 1) {
    const y = padding.top + (plotHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(chartWidth - padding.right, y);
    ctx.stroke();
  }

  // Y轴百分比文字
  ctx.fillStyle = "rgba(220,235,245,0.65)";
  ctx.font = "12px Microsoft YaHei";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= 5; i += 1) {
    const value = 100 - i * 20;
    const y = padding.top + (plotHeight / 5) * i;
    ctx.fillText(`${value}%`, padding.left - 10, y);
  }

  // =========================
  // 每个点都绘制竖向刻度线
  // =========================
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;

  points.forEach((point, index) => {
    const x = getX(index);
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, chartHeight - padding.bottom);
    ctx.stroke();
  });

  // =========================
  // 横轴标签：每个点都显示手续费横轴
  // 为了避免重叠，文字旋转显示
  // =========================
  ctx.fillStyle = "rgba(220,235,245,0.65)";
  ctx.font = "11px Microsoft YaHei";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  points.forEach((point, index) => {
    const x = getX(index);
    const y = chartHeight - padding.bottom + 16;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 3); // 鏃嬭浆 60 搴?
    ctx.fillText(point.feeAxis.toFixed(1), 0, 0);
    ctx.restore();
  });

  // X杞存爣棰?
  ctx.save();
  ctx.fillStyle = "rgba(220,235,245,0.55)";
  ctx.font = "13px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("手续费横轴", padding.left + plotWidth / 2, chartHeight - 20);
  ctx.restore();

  // =========================
  // 鐢讳笁鏉℃洸绾?
  // =========================
  function drawLine(key, color) {
    ctx.beginPath();

    points.forEach((point, index) => {
      const x = getX(index);
      const y = getY(point[key]);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawLine("incomeRate", "#d8c36a");   // 预计收入
  drawLine("feeRateLine", "#59b7ff");  // 手续费
  drawLine("depositRate", "#8f9aa6");  // 保证金

  // =========================
  // 高亮当前价格对应的点位
  // =========================
  let activeIndex = 0;
  let minDiff = Infinity;

  points.forEach((point, index) => {
    const diff = Math.abs(point.price - info.currentPrice);
    if (diff < minDiff) {
      minDiff = diff;
      activeIndex = index;
    }
  });

  const activeX = getX(activeIndex);

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(activeX, padding.top);
  ctx.lineTo(activeX, chartHeight - padding.bottom);
  ctx.stroke();
}
/**
 * 打开变化曲线弹窗
 */
function openTrendModal() {
  const info = getDraftInfo();
  if (!info) return;

  const mask = $("trendModalMask");
  const title = $("trendModalItemTitle");

  if (title) {
    title.textContent = `${info.item.name} / 数量 ${info.quantity} / 当前手续费横轴 ${info.feeAxis.toFixed(1)}`;
  }

  if (mask) {
    mask.classList.add("show");
  }

  renderTrendModalChart(info);
}

/**
 * 关闭变化曲线弹窗
 */
function closeTrendModal() {
  const mask = $("trendModalMask");
  if (mask) {
    mask.classList.remove("show");
  }
}
/* =========================================================
 * 九、顶部金币显示 / 数据状态显示
 * ========================================================= */

function updateGoldText() {
  const topGoldText = $("topGoldText");
  if (topGoldText) {
    topGoldText.textContent = formatMoney(state.gold);
  }
}

function updateDataStatus(text) {
  const el = $("dataStatusText");
  if (el) {
    el.textContent = text;
  }
}

function addCustomGold() {
  const input = $("goldAmountInput");
  if (!input) return;

  const amount = Math.floor(Number(input.value));
  if (!Number.isFinite(amount) || amount <= 0) {
    input.value = DEFAULT_ADD_GOLD;
    showMessageModal("输入无效", "请输入大于 0 的金币数量。");
    return;
  }

  state.gold += amount;
  saveState();
  renderAll();

  input.value = String(amount);
  showMessageModal(
    "增加成功",
    `已增加金币：${formatMoney(amount)}\n当前金币：${formatMoney(state.gold)}`
  );
}


/* =========================================================
 * 十、交易记录
 * ========================================================= */

function addRecord(type, itemName, price, count, extra = {}) {
  state.records.unshift(createRecordEntry(type, itemName, price, count, extra));
  saveState();
}

/* =========================================================
 * 十一、读取静态数据
 * 从 items-data.js 里读取：
 * - window.ITEMS_DATA
 * - window.SERVICE_CHARGE_DATA
 * - window.DEPARTMENT_TASK_DATA
 * ========================================================= */

function loadStaticData() {
  state.items = normalizeItems(window.ITEMS_DATA);
  state.serviceChargeRules = normalizeServiceChargeRules(window.SERVICE_CHARGE_DATA);
  state.departmentTasks = normalizeDepartmentTasks(window.DEPARTMENT_TASK_DATA);

  const departmentNames = [...new Set(state.departmentTasks.map(task => task.department).filter(Boolean))];
  if (!departmentNames.includes(state.currentDepartment)) {
    state.currentDepartment = departmentNames[0] || "";
  }

  const currentDepartmentTasks = state.departmentTasks.filter(task => task.department === state.currentDepartment);
  if (!currentDepartmentTasks.some(task => task.taskId === state.selectedDepartmentTaskId)) {
    state.selectedDepartmentTaskId = currentDepartmentTasks[0]?.taskId || "";
  }


  if (state.items.length > 0) {
    updateDataStatus(
      `已读取静态数据：物品 ${state.items.length} 条，手续费规则 ${state.serviceChargeRules.length} 条`
    );
  } else {
    updateDataStatus("未读取到静态数据，请先执行 build-static-data.js");
  }

  renderFilters();
  renderAll();
}


/* =========================================================
 * 十二、通用弹窗
 * ========================================================= */

function openModal({
  title = "提示",
  content = "",
  confirmText = "确定",
  cancelText = "取消",
  showCancel = true,
  onConfirm = null
}) {
  const mask = $("modalMask");
  const titleEl = $("modalTitle");
  const contentEl = $("modalContent");
  const cancelBtn = $("modalCancelBtn");
  const confirmBtn = $("modalConfirmBtn");

  if (!mask || !titleEl || !contentEl || !cancelBtn || !confirmBtn) return;

  titleEl.textContent = title;
  contentEl.textContent = content;
  cancelBtn.textContent = cancelText;
  confirmBtn.textContent = confirmText;
  cancelBtn.style.display = showCancel ? "inline-block" : "none";

  state.modalConfirmHandler = onConfirm;
  mask.classList.add("show");
}

function closeModal() {
  const mask = $("modalMask");
  if (mask) {
    mask.classList.remove("show");
  }
  state.modalConfirmHandler = null;
}

function showMessageModal(title, content) {
  openModal({
    title,
    content,
    confirmText: "确定",
    showCancel: false,
    onConfirm: () => {
      closeModal();
    }
  });
}

function showConfirmModal(title, content, onConfirm) {
  openModal({
    title,
    content,
    confirmText: "确认",
    cancelText: "取消",
    showCancel: true,
    onConfirm: () => {
      if (typeof onConfirm === "function") {
        onConfirm();
      }
    }
  });
}
function openItemDetail(itemId) {
  const item = state.items.find(entry => entry.id === itemId);
  if (!item) return;

  const mask = $("itemDetailMask");
  if (!mask) return;

  $("itemDetailName").textContent = item.name || "-";
  $("itemDetailCategory").textContent = item.category || "-";
  $("itemDetailQuality").textContent = item.quality || "-";
  $("itemDetailLength").textContent = item.length || "-";
  $("itemDetailWidth").textContent = item.width || "-";
  $("itemDetailPrice").textContent = formatMoney(item.initialPrice || item.buyPrice || 0);
  $("itemDetailPriceUpper").textContent = formatMoney(item.priceUpper || getMaxListPrice(item));
  $("itemDetailPriceLower").textContent = formatMoney(item.priceLower || getMinListPrice(item));
  $("itemDetailMinDeposit").textContent = formatMoney(item.minDeposit || 0);
  $("itemDetailDescription").textContent = item.description || "暂无描述";

  mask.classList.add("show");
}

function closeItemDetail() {
  const mask = $("itemDetailMask");
  if (mask) {
    mask.classList.remove("show");
  }
}

function handleItemDetailCardClick(event, itemId) {
  if (event?.target && typeof event.target.closest === "function" && event.target.closest(".card-btn")) {
    return;
  }

  openItemDetail(itemId);
}

function handleListingEditorCardClick(event, itemId) {
  if (event?.target && typeof event.target.closest === "function" && event.target.closest(".card-btn")) {
    return;
  }

  openListingEditor(itemId);
}
/* =========================================================
 * 十三、基础列表获取
 * ========================================================= */

/**
 * 按品质排序，再按 seq，再按名称排序
 */
function getSortedItems(items) {
  return items.slice().sort((a, b) => {
    const qualityDiff = getQualitySortValue(a.quality) - getQualitySortValue(b.quality);
    if (qualityDiff !== 0) return qualityDiff;

    const seqDiff = (a.seq || 999999) - (b.seq || 999999);
    if (seqDiff !== 0) return seqDiff;

    return String(a.name).localeCompare(String(b.name), "zh-CN");
  });
}

/**
 * 仓库所有物品（不过滤）
 */
function getInventoryItemsRaw() {
  return getSortedItems(
    state.items
      .filter(item => (state.inventory[item.id] || 0) > 0)
      .map(item => ({
        ...item,
        count: state.inventory[item.id]
      }))
  );
}

/**
 * 购买页过滤后的物品
 */
function getFilteredItems() {
  return getSortedItems(
    state.items.filter(item => {
      const matchKeyword = !state.keyword || item.name.includes(state.keyword);
      const matchCategory = !state.currentCategory || item.category === state.currentCategory;
      const matchQuality = !state.currentQuality || item.quality === state.currentQuality;
      return matchKeyword && matchCategory && matchQuality;
    })
  );
}

/**
 * 交易行出售页右侧：仓库中可上架的物品
 */
function getFilteredInventoryItems() {
  return getSortedItems(
    state.items
      .filter(item => (state.inventory[item.id] || 0) > 0)
      .filter(item => {
        const matchKeyword = !state.keyword || item.name.includes(state.keyword);
        const matchCategory = !state.currentCategory || item.category === state.currentCategory;
        const matchQuality = !state.currentQuality || item.quality === state.currentQuality;
        return matchKeyword && matchCategory && matchQuality;
      })
      .map(item => ({
        ...item,
        count: state.inventory[item.id]
      }))
  );
}


/* =========================================================
 * 十四、左侧筛选渲染
 * ========================================================= */

function renderFilters() {
  const categoryList = $("categoryList");
  const qualityList = $("qualityList");
  if (!categoryList || !qualityList) return;

  const categories = [...new Set(state.items.map(item => item.category).filter(Boolean))];
  const qualities = [...new Set(state.items.map(item => item.quality).filter(Boolean))];

  // 当前筛选如果已经不存在了，就重置
  if (state.currentCategory && !categories.includes(state.currentCategory)) {
    state.currentCategory = "";
  }

  if (state.currentQuality && !qualities.includes(state.currentQuality)) {
    state.currentQuality = "";
  }

  categoryList.innerHTML =
    `<div class="filter-item ${state.currentCategory === "" ? "active" : ""}" data-type="category" data-value="">全部</div>` +
    categories.map(category => `
      <div class="filter-item ${state.currentCategory === category ? "active" : ""}" data-type="category" data-value="${escapeHtml(category)}">
        ${escapeHtml(category)}
      </div>
    `).join("");

  qualityList.innerHTML =
    `<div class="filter-item ${state.currentQuality === "" ? "active" : ""}" data-type="quality" data-value="">全部</div>` +
    qualities.map(quality => `
      <div class="filter-item ${state.currentQuality === quality ? "active" : ""}" data-type="quality" data-value="${escapeHtml(quality)}">
        ${escapeHtml(quality)}
      </div>
    `).join("");

  bindFilterClick();
}

function bindFilterClick() {
  document.querySelectorAll(".filter-item").forEach(element => {
    element.addEventListener("click", () => {
      const { type, value } = element.dataset;

      if (type === "category") state.currentCategory = value;
      if (type === "quality") state.currentQuality = value;

      renderFilters();
      renderAll();
    });
  });
}

/* =========================================================
 * 十五、购买逻辑
 * ========================================================= */

function performBuyItem(id) {
  const item = state.items.find(entry => entry.id === id);
  if (!item) return;

  if (state.gold < item.buyPrice) {
    showMessageModal("金币不足", `当前金币不足，无法购买「${item.name}」。`);
    return;
  }

  state.gold -= item.buyPrice;
  state.inventory[id] = (state.inventory[id] || 0) + 1;

  addRecord("购买", item.name, item.buyPrice, 1, {
    itemId: item.id,
    category: item.category,
    quality: item.quality,
    side: "buy"
  });
  saveState();
  renderAll();

  showMessageModal(
    "购买成功",
    `你已成功购买「${item.name}」。\n已放入仓库。\n消耗金币：${formatMoney(item.buyPrice)}\n当前金币：${formatMoney(state.gold)}`
  );
}

function buyItem(id) {
  const item = state.items.find(entry => entry.id === id);
  if (!item) return;

  showConfirmModal(
    "确认购买",
    `确定要购买「${item.name}」吗？\n需要消耗金币：${formatMoney(item.buyPrice)}\n购买后会自动放入仓库。`,
    () => {
      closeModal();
      performBuyItem(id);
    }
  );
}


/* =========================================================
 * 十六、仓库直接出售（系统回收）
 * 注意：这不是交易行挂单，只是系统直接按 sellPrice 回收
 * ========================================================= */

function performSellItem(id) {
  const item = state.items.find(entry => entry.id === id);
  if (!item) return;

  const count = state.inventory[id] || 0;
  if (count <= 0) {
    showMessageModal("出售失败", `仓库中没有「${item.name}」，无法出售。`);
    return;
  }

  state.inventory[id] -= 1;
  if (state.inventory[id] <= 0) {
    delete state.inventory[id];
  }

  state.gold += item.sellPrice;

  addRecord("出售", item.name, item.sellPrice, 1, {
    itemId: item.id,
    category: item.category,
    quality: item.quality,
    side: "sell"
  });
  saveState();
  renderAll();

  showMessageModal(
    "出售成功",
    `你已成功出售「${item.name}」。\n获得金币：${formatMoney(item.sellPrice)}\n当前金币：${formatMoney(state.gold)}`
  );
}

function sellItem(id) {
  const item = state.items.find(entry => entry.id === id);
  if (!item) return;

  const count = state.inventory[id] || 0;
  if (count <= 0) {
    showMessageModal("出售失败", `仓库中没有「${item.name}」，无法出售。`);
    return;
  }

  showConfirmModal(
    "确认出售",
    `确定要出售「${item.name}」吗？\n当前库存：${count}\n出售可获得金币：${formatMoney(item.sellPrice)}`,
    () => {
      closeModal();
      performSellItem(id);
    }
  );
}

/* =========================================================
 * 十七、上架编辑器草稿
 * ========================================================= */

/**
 * 根据草稿找到当前正在编辑的物品
 */
function getDraftItem() {
  if (!state.listingDraft) return null;
  return state.items.find(item => item.id === state.listingDraft.itemId) || null;
}

/**
 * 保证草稿值始终合法
 * - 数量不能超过库存
 * - 价格不能低于最低价 / 不能高于最高价
 */
function ensureDraftValid() {
  if (!state.listingDraft) return;

  const item = getDraftItem();
  if (!item) return;

  const stockCount = state.inventory[item.id] || 0;
  const minPrice = getMinListPrice(item);
  const maxPrice = getMaxListPrice(item);
  const maxQuantity = Math.max(1, stockCount);

  if (stockCount <= 0) {
    state.listingDraft.quantity = 0;
  } else {
    state.listingDraft.quantity = clamp(
      Math.floor(Number(state.listingDraft.quantity) || 1),
      1,
      maxQuantity
    );
  }

  let price = Math.round(Number(state.listingDraft.currentPrice) || getReferencePrice(item));
  if (price < minPrice) price = minPrice;
  if (price > maxPrice) price = maxPrice;

  state.listingDraft.currentPrice = price;
}

/**
 * 打开上架编辑器
 * 点击出售页右侧物品卡片时会走这里
 */
function openListingEditor(itemId) {
  const item = state.items.find(entry => entry.id === itemId);
  if (!item) return;

  const stockCount = state.inventory[item.id] || 0;
  if (stockCount <= 0) {
    showMessageModal("无法上架", `仓库中没有「${item.name}」。`);
    return;
  }

  const availableSlots = getAvailableListingSlots();
  if (false && availableSlots <= 0) {
    showMessageModal("售位已满", `当前可用槽位为 0，可花费 ${formatMoney(LISTING_SLOT_PRICE)} 金币购买新槽位。`);
    return;
  }

  state.listingDraft = {
    itemId,
    quantity: Math.min(1, stockCount) || 0,
    currentPrice: Math.max(getReferencePrice(item), getMinListPrice(item)),
    showDetail: false
  };

  renderListingEditor();

  const mask = $("listingEditorMask");
  if (mask) {
    mask.classList.add("show");
  }
}

/**
 * 关闭上架编辑器
 */
function closeListingEditor() {
  const mask = $("listingEditorMask");
  if (mask) {
    mask.classList.remove("show");
  }

  state.listingDraft = null;
}

/**
 * 根据当前草稿生成上架信息
 */
function getDraftInfo() {
  if (!state.listingDraft) return null;

  const item = getDraftItem();
  if (!item) return null;

  ensureDraftValid();

  return calculateListingInfo(
    item,
    state.listingDraft.currentPrice,
    state.listingDraft.quantity
  );
}

function getListingBlockedState(info) {
  if (!info || !info.item) {
    return {
      title: "无法上架",
      message: "当前没有可上架的物品信息。"
    };
  }

  const item = info.item;
  const stockCount = state.inventory[item.id] || 0;

  if (stockCount <= 0 || info.stockCount <= 0 || info.quantity <= 0) {
    return {
      title: "库存不足",
      message: `仓库库存不足，无法上架「${item.name}」。`
    };
  }

  if (stockCount < info.quantity) {
    return {
      title: "库存不足",
      message: `仓库库存不足，无法上架「${item.name}」。`
    };
  }

  if (info.quantity > info.availableSlots) {
    return {
      title: "槽位不足",
      message: `当前可用槽位：${info.availableSlots}`
    };
  }

  if (state.gold < info.deposit) {
    return {
      title: "金币不足",
      message: `上架「${item.name}」需要先支付保证金 ${formatMoney(info.deposit)}，当前金币不足。`
    };
  }

  return null;
}

/**
 * 数量 - / +
 */
function changeDraftQuantity(delta) {
  if (!state.listingDraft) return;

  const item = getDraftItem();
  if (!item) return;

  const stockCount = state.inventory[item.id] || 1;
  const maxQuantity = Math.max(1, stockCount);

  if (stockCount <= 0) {
    state.listingDraft.quantity = 0;
  } else {
    state.listingDraft.quantity = clamp(
      (state.listingDraft.quantity || 1) + delta,
      1,
      maxQuantity
    );
  }

  renderListingEditor();
}

/**
 * 通过滑条直接设置数量
 */
function setDraftQuantity(value) {
  if (!state.listingDraft) return;

  const item = getDraftItem();
  if (!item) return;

  const stockCount = state.inventory[item.id] || 1;
  const maxQuantity = Math.max(1, stockCount);

  if (stockCount <= 0) {
    state.listingDraft.quantity = 0;
  } else {
    state.listingDraft.quantity = clamp(
      Math.floor(Number(value) || 1),
      1,
      maxQuantity
    );
  }

  renderListingEditor();
}

/**
 * 价格 - ：按上一个价格 / 1.01 回退
 */
function decreaseDraftPrice() {
  if (!state.listingDraft) return;

  const item = getDraftItem();
  if (!item) return;

  const minPrice = getMinListPrice(item);

  let price = Math.round((state.listingDraft.currentPrice || minPrice) / 1.01);
  if (price < minPrice) price = minPrice;

  state.listingDraft.currentPrice = price;
  renderListingEditor();
}

/**
 * 价格 + ：按上一个价格 * 1.01 增长
 */
function increaseDraftPrice() {
  if (!state.listingDraft) return;

  const item = getDraftItem();
  if (!item) return;

  const maxPrice = getMaxListPrice(item);

  let price = Math.round((state.listingDraft.currentPrice || getReferencePrice(item)) * 1.01);
  if (price > maxPrice) price = maxPrice;

  state.listingDraft.currentPrice = price;
  renderListingEditor();
}

/**
 * 输入框直接设置价格
 * 低于最低价时自动修正
 */
function setDraftPrice(value) {
  if (!state.listingDraft) return;

  const item = getDraftItem();
  if (!item) return;

  const minPrice = getMinListPrice(item);
  const maxPrice = getMaxListPrice(item);

  let price = Math.round(Number(value) || minPrice);

  if (price < minPrice) price = minPrice;
  if (price > maxPrice) price = maxPrice;

  state.listingDraft.currentPrice = price;
  renderListingEditor();
}

/**
 * 展开 / 收起 “?” 详情区
 */
function toggleDraftDetail() {
  if (!state.listingDraft) return;

  state.listingDraft.showDetail = !state.listingDraft.showDetail;
  renderListingEditor();
}


/* =========================================================
 * 十八、上架编辑器 - 左侧图表
 *
 * 柱子规则：
 * 1. 内部最多计算 9 根柱子
 * 2. 默认以第 5 根柱子的区间上限作为在售最低价
 * 3. 每段区间长度 = (售价上限 - 售价下限) * 0.33554794980203%
 * 4. 最右侧最后 1 根柱子的区间上限直接使用售价上限
 * 5. 当前售价落在哪个区间，就高亮哪根柱子
 * ========================================================= */
function getListingPriceBarMeta(info) {
  const item = info.item || {};
  const priceLower = toNumber(item.priceLower) || info.minPrice;
  const priceUpper = toNumber(item.priceUpper) || info.maxPrice;
  const range = Math.max(1, priceUpper - priceLower);
  const intervalSize = Math.max(1, Math.round(range * LISTING_PRICE_BAR_INTERVAL_RATE));
  const centerUpperBound = info.referencePrice;
  const rightFiniteBarCount = Math.max(0, LISTING_PRICE_BAR_COUNT - LISTING_PRICE_BAR_CENTER_INDEX - 2);

  const candidateUpperBounds = [];
  for (let offset = -LISTING_PRICE_BAR_CENTER_INDEX; offset <= rightFiniteBarCount; offset += 1) {
    candidateUpperBounds.push(centerUpperBound + offset * intervalSize);
  }
  candidateUpperBounds.push(priceUpper);

  const upperBounds = [];
  candidateUpperBounds.forEach(value => {
    const fixedValue = clamp(Math.round(value), priceLower, priceUpper);
    if (!upperBounds.length || fixedValue > upperBounds[upperBounds.length - 1]) {
      upperBounds.push(fixedValue);
    }
  });

  const centerBarIndex = upperBounds.findIndex(value => value === clamp(Math.round(centerUpperBound), priceLower, priceUpper));
  const activeIndex = upperBounds.findIndex((upperBound, index) => {
    const lowerBound = index === 0 ? priceLower : upperBounds[index - 1];

    if (index === 0) {
      return info.currentPrice >= lowerBound && info.currentPrice <= upperBound;
    }

    return info.currentPrice > lowerBound && info.currentPrice <= upperBound;
  });

  const normalizedCenterIndex = centerBarIndex >= 0 ? centerBarIndex : Math.min(LISTING_PRICE_BAR_CENTER_INDEX, upperBounds.length - 1);
  const normalizedActiveIndex = activeIndex >= 0 ? activeIndex : upperBounds.length - 1;

  const allBars = upperBounds.map((upperBound, index) => {
    const distance = Math.abs(index - normalizedCenterIndex);
    const height = Math.max(14, 78 - distance * 14);

    return {
      index,
      upperBound,
      lowerBound: index === 0 ? priceLower : upperBounds[index - 1],
      height,
      isActive: index === normalizedActiveIndex
    };
  });

  const maxStartIndex = Math.max(0, allBars.length - LISTING_PRICE_VISIBLE_BAR_COUNT);
  const defaultStartIndex = Math.min(LISTING_PRICE_BAR_CENTER_INDEX, maxStartIndex);
  const visibleStartIndex = Math.min(defaultStartIndex, normalizedActiveIndex);

  return {
    allBars,
    activeIndex: normalizedActiveIndex,
    centerIndex: normalizedCenterIndex,
    visibleBars: allBars.slice(
      visibleStartIndex,
      visibleStartIndex + LISTING_PRICE_VISIBLE_BAR_COUNT
    )
  };
}

function buildListingPriceBars(info) {
  return getListingPriceBarMeta(info).visibleBars;
}

function getListingSystemRecycleRule(listing) {
  const item = getListingItem(listing);
  if (!item) {
    return {
      barIndex: -1,
      recycleDelayMs: 0,
      ruleType: ""
    };
  }

  const info = calculateListingInfo(
    item,
    toNumber(listing?.perItemPrice),
    Math.max(1, toNumber(listing?.quantity) || 1)
  );
  const barMeta = getListingPriceBarMeta(info);
  const barIndex = barMeta.activeIndex;

  if (barIndex >= 0 && barIndex < LISTING_PRICE_BAR_CENTER_INDEX) {
    return {
      barIndex,
      recycleDelayMs: LISTING_SYSTEM_RECYCLE_FAST_MS,
      ruleType: "fast"
    };
  }

  if (barIndex === LISTING_PRICE_BAR_CENTER_INDEX) {
    return {
      barIndex,
      recycleDelayMs: LISTING_SYSTEM_RECYCLE_CENTER_MS,
      ruleType: "center"
    };
  }

  return {
    barIndex,
    recycleDelayMs: 0,
    ruleType: ""
  };
}

function getListingSystemRecycleAtTs(listing) {
  const storedSystemRecycleAtTs = parseStoredTimeMs(listing?.systemRecycleAtTs);
  if (storedSystemRecycleAtTs) {
    return storedSystemRecycleAtTs;
  }

  const createdAtTs = parseStoredTimeMs(listing?.createdAtTs || listing?.createdAt);
  if (!createdAtTs) return 0;

  const rule = getListingSystemRecycleRule(listing);
  if (!rule.recycleDelayMs) return 0;

  return createdAtTs + rule.recycleDelayMs;
}

function getListingRemainingMs(listing, now = Date.now()) {
  const expireAtTs = parseStoredTimeMs(listing?.expireAtTs);
  const systemRecycleAtTs = getListingSystemRecycleAtTs(listing);

  let nextDeadlineTs = expireAtTs || 0;

  if (systemRecycleAtTs && (!nextDeadlineTs || systemRecycleAtTs < nextDeadlineTs)) {
    nextDeadlineTs = systemRecycleAtTs;
  }

  if (!nextDeadlineTs) return 0;
  return Math.max(0, nextDeadlineTs - now);
}

function getListingLifecycleResult(listing, now = Date.now()) {
  const expireAtTs = parseStoredTimeMs(listing?.expireAtTs);
  const systemRecycleAtTs = getListingSystemRecycleAtTs(listing);
  const rule = getListingSystemRecycleRule(listing);

  if (systemRecycleAtTs && systemRecycleAtTs <= now && (!expireAtTs || systemRecycleAtTs <= expireAtTs)) {
    return {
      status: "systemRecycle",
      triggerAtTs: systemRecycleAtTs,
      rule
    };
  }

  if (expireAtTs && expireAtTs <= now) {
    return {
      status: "expired",
      triggerAtTs: expireAtTs,
      rule
    };
  }

  return {
    status: "active",
    triggerAtTs: 0,
    rule
  };
}

function renderListingPriceChart(info) {
  const chart = $("listingPriceChart");
  if (!chart) return;

  const bars = buildListingPriceBars(info);
  chart.style.gridTemplateColumns = `repeat(${bars.length}, minmax(0, 1fr))`;

  chart.innerHTML = bars.map(bar => `
    <div class="listing-bar-item ${bar.isActive ? "active" : ""}">
      <div class="listing-bar-top">${formatMoney(bar.upperBound)}</div>
      <div class="listing-bar-wrap">
        <div class="listing-bar-fill" style="height:${bar.height}%;"></div>
      </div>
      <div class="listing-bar-bottom">${formatMoney(bar.upperBound)}</div>
    </div>
  `).join("");
}


/* =========================================================
 * 十九、上架编辑器渲染
 * ========================================================= */
function renderListingEditor() {
  const info = getDraftInfo();
  if (!info) return;

  const item = info.item;

  const nameEl = $("listingEditorName");
  const categoryEl = $("listingEditorCategory");
  const lowestEl = $("listingLowestPriceText");
  const qtyTextEl = $("listingQtyText");
  const slotUseEl = $("listingSlotUseText");
  const qtyRangeEl = $("listingQtyRange");
  const referenceEl = $("listingReferencePriceText");
  const priceInputEl = $("listingPriceInput");
  const expectedEl = $("listingExpectedText");
  const detailBoxEl = $("listingDetailBox");
  const detailSaleTotalEl = $("detailSaleTotalText");
  const detailFeeTextEl = $("detailFeeText");
  const detailDepositEl = $("detailDepositText");
  const detailFeeAxisEl = $("detailFeeAxisText");
  const detailFeeIndexEl = $("detailFeeIndexText");
  const detailExpectedEl = $("detailExpectedText");
  const detailFeeRateEl = $("detailFeeRateText");
  const priceWarningEl = $("listingPriceWarning");
  const confirmBtnEl = $("listingConfirmBtn");

  if (nameEl) nameEl.textContent = item.name;
  if (categoryEl) categoryEl.textContent = `${item.category || "-"} / ${item.quality || "-"}`;
  if (lowestEl) lowestEl.textContent = formatMoney(info.referencePrice);

  // 数量显示：当前上架数量 / 仓库库存
  if (qtyTextEl) qtyTextEl.textContent = `${info.quantity}/${info.stockCount}`;

  // 售位显示：当前使用售位 / 当前可用售位
  if (slotUseEl) slotUseEl.textContent = `${info.slotsToUse}/${info.availableSlots}`;

  // 数量滑条
  if (qtyRangeEl) {
  // 这里把最小值改成 0
  // 这样 quantity = 1 且 stockCount = 1 时，滑条仍会显示满格
    qtyRangeEl.min = 0;
    qtyRangeEl.max = Math.max(1, info.stockCount);
    qtyRangeEl.value = Math.min(info.quantity, Number(qtyRangeEl.max));
  }

  // 参考价
  if (referenceEl) referenceEl.textContent = formatMoney(info.referencePrice);

  // 当前输入价格（单件）
  if (priceInputEl) priceInputEl.value = String(info.currentPrice);

  // 预期收入（合计）
  if (expectedEl) expectedEl.textContent = formatMoney(info.expectedReceive);

  /* -------------------------
   * “?” 详情区
   * 这里展示的是合计数据
   * 手续费率显示的是单件判定后的手续费率
   * ------------------------- */
  if (detailSaleTotalEl) detailSaleTotalEl.textContent = formatMoney(info.totalPrice);
  if (detailFeeTextEl) detailFeeTextEl.textContent = formatMoney(info.fee);
  if (detailDepositEl) detailDepositEl.textContent = formatMoney(info.deposit);
  if (detailFeeAxisEl) detailFeeAxisEl.textContent = info.feeAxis.toFixed(1);
  if (detailFeeIndexEl) detailFeeIndexEl.textContent = String(info.feeIndex);
  if (detailExpectedEl) detailExpectedEl.textContent = formatMoney(info.expectedReceive);
  if (detailFeeRateEl) detailFeeRateEl.textContent = `${(info.feeRate * 100).toFixed(2)}%`;

  if (detailBoxEl) {
    detailBoxEl.style.display = state.listingDraft && state.listingDraft.showDetail ? "block" : "none";
  }

  // 价格提示
  if (priceWarningEl) {
    if (info.currentPrice <= info.minPrice) {
      priceWarningEl.textContent =
        `当前价格已按最低售价修正：${formatMoney(info.minPrice)}（范围 ${formatMoney(info.minPrice)} ~ ${formatMoney(info.maxPrice)}）`;
    } else {
      priceWarningEl.textContent =
        `可定价范围：${formatMoney(info.minPrice)} ~ ${formatMoney(info.maxPrice)}`;
    }
  }

  const blockedState = getListingBlockedState(info);

  // 上架按钮始终可点击，点击后再提示具体原因
  if (confirmBtnEl) {
    confirmBtnEl.disabled = false;
    confirmBtnEl.textContent = "上架";
    confirmBtnEl.title = blockedState ? blockedState.message : "";
  }

  renderListingPriceChart(info);
}

/* =========================================================
 * 二十、确认上架
 *
 * 注意：
 * - 一个挂单只占一个槽位
 * - 即使一次上架多件，也只生成一个挂单
 * - 上架时扣除的是总保证金
 * - 下架时保证金不返还
 * ========================================================= */
function confirmListing() {}

function showListingDetail() {}

function unlistItem() {}


/* =========================================================
 * 二十二、渲染 - 购买页
 * ========================================================= */
function renderBuyGrid() {
  const wrap = $("buyGrid");
  if (!wrap) return;

  if (!state.items.length) {
    wrap.innerHTML = `<div class="empty-block">暂无静态数据，请先运行 build-static-data.js</div>`;
    return;
  }

  const items = getFilteredItems();

  if (!items.length) {
    wrap.innerHTML = `<div class="empty-block">没有符合条件的物品</div>`;
    return;
  }

  wrap.innerHTML = items.map(item => `
    <div class="item-card clickable-card" data-item-id="${item.id}" onclick="handleItemDetailCardClick(event, '${item.id}')">
      <div class="quality-badge q-${item.quality || "白"}">${item.quality || "-"}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-category">${item.category || "-"}</div>

      <div class="item-main">
        <div class="item-image">物品图片</div>

        <div class="item-right">
          <div class="item-price">${formatMoney(item.buyPrice)}</div>
          <button class="card-btn" onclick="event.stopPropagation(); buyItem('${item.id}')">购买</button>
        </div>
      </div>
    </div>
  `).join("");
}
function renderSellGrid() {
  const wrap = $("sellSelectGrid") || $("sellGrid");
  if (!wrap) return;

  if (!state.items.length) {
    wrap.innerHTML = `<div class="empty-block">暂无静态数据</div>`;
    return;
  }

  const items = getInventoryItemsRaw();

  if (!items.length) {
    wrap.innerHTML = `<div class="empty-block">当前没有可上架的仓库物品</div>`;
    return;
  }

  wrap.innerHTML = items.map(item => `
    <div class="item-card compact-card clickable-card" data-item-id="${item.id}" onclick="handleListingEditorCardClick(event, '${item.id}')">
      <div class="quality-badge q-${item.quality || "白"}">${item.quality || "-"}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-category">${item.category || "-"} · <span class="count-text">库存 ${item.count}</span></div>

      <div class="item-main">
        <div class="item-image">仓库物品</div>

        <div class="item-right">
          <div class="item-price-label">参考价格</div>
          <div class="item-price">${formatMoney(getReferencePrice(item))}</div>
          <div class="item-actions">
            <button class="card-btn info" onclick="event.stopPropagation(); openListingEditor('${item.id}')">上架</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}
function renderWarehouseGrid() {
  const wrap = $("warehouseGrid");
  const summary = $("warehouseSummaryText");
  if (!wrap || !summary) return;

  if (!state.items.length) {
    wrap.innerHTML = `<div class="empty-block">暂无静态数据</div>`;
    summary.textContent = "暂无数据";
    return;
  }

  const items = getInventoryItemsRaw();
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  if (!items.length) {
    wrap.innerHTML = `<div class="empty-block">仓库为空，先去交易行购买一些物品吧</div>`;
    summary.textContent = "当前仓库为空";
    return;
  }

  summary.textContent = `仓库共有 ${items.length} 种物品，合计 ${totalCount} 件`;

  wrap.innerHTML = items.map(item => `
    <div class="item-card compact-card clickable-card" data-item-id="${item.id}" onclick="handleItemDetailCardClick(event, '${item.id}')">
      <div class="quality-badge q-${item.quality || "白"}">${item.quality || "-"}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-category">${item.category || "-"} · <span class="count-text">库存 ${item.count}</span></div>

      <div class="item-main">
        <div class="item-image">仓库物品</div>

        <div class="item-right">
          <div class="item-price-label">系统回收价</div>
          <div class="item-price">${formatMoney(item.sellPrice)}</div>
          <div class="item-actions">
            <button class="card-btn info" onclick="event.stopPropagation(); goToTradeSellTab();">前往交易行</button>
            <button class="card-btn sell" onclick="event.stopPropagation(); sellItem('${item.id}')">出售</button>
          </div>
        </div>
      </div>
    </div>
  `).join("");
}
function getDepartmentTaskById(taskId) {
  return state.departmentTasks.find(task => task.taskId === String(taskId));
}

function getDepartmentNames() {
  const seen = new Set();
  const names = [];

  state.departmentTasks
    .slice()
    .sort((a, b) => (a.seq || 0) - (b.seq || 0))
    .forEach(task => {
      const department = toText(task.department);
      if (!department || seen.has(department)) return;
      seen.add(department);
      names.push(department);
    });

  return names;
}

function getDepartmentTasks(department = state.currentDepartment) {
  return state.departmentTasks
    .filter(task => !department || task.department === department)
    .slice()
    .sort((a, b) => {
      const seqDiff = (a.seq || 0) - (b.seq || 0);
      if (seqDiff !== 0) return seqDiff;

      const idDiff = toNumber(a.taskId) - toNumber(b.taskId);
      if (idDiff !== 0) return idDiff;

      return String(a.taskId).localeCompare(String(b.taskId), "zh-CN");
    });
}

function getDepartmentTaskDisplayTarget(task) {
  const target = toText(task?.target);
  const targetCount = task?.targetCount;

  if (!target) return "-";
  if (targetCount === "" || targetCount == null) return target;
  return `${target} x ${formatMixedValue(targetCount)}`;
}

function getDepartmentTaskLabel(taskId, department = state.currentDepartment) {
  if (!taskId) return "无前置任务";

  const departmentTask = getDepartmentTasks(department).find(task => task.taskId === String(taskId));
  if (departmentTask) {
    return `${departmentTask.name} (${departmentTask.taskId})`;
  }

  return String(taskId);
}

function joinDepartmentPreview(names, limit = 2) {
  const list = names.filter(Boolean);
  if (!list.length) return "-";
  if (list.length <= limit) return list.join(" / ");
  return `${list.slice(0, limit).join(" / ")} +${list.length - limit}`;
}

function getDepartmentRewardSummary(tasks) {
  const rewardMap = new Map();

  tasks.forEach(task => {
    task.rewards.forEach(reward => {
      if (!reward.name) return;

      if (!rewardMap.has(reward.name)) {
        rewardMap.set(reward.name, {
          name: reward.name,
          amount: typeof reward.amount === "number" ? 0 : ""
        });
      }

      const target = rewardMap.get(reward.name);
      if (typeof reward.amount === "number") {
        target.amount = Number(target.amount || 0) + reward.amount;
      } else if (!target.amount) {
        target.amount = reward.amount;
      }
    });
  });

  return Array.from(rewardMap.values());
}

function getDepartmentViewportBounds(viewportWidth, viewportHeight, contentWidth, contentHeight) {
  const freePaddingX = Math.max(Math.round(viewportWidth * 0.55), 360);
  const freePaddingY = Math.max(Math.round(viewportHeight * 0.45), 240);

  return {
    minX: viewportWidth - contentWidth - freePaddingX,
    maxX: freePaddingX,
    minY: viewportHeight - contentHeight - freePaddingY,
    maxY: freePaddingY
  };
}

function clampDepartmentViewport(offsetX, offsetY) {
  const viewport = state.departmentViewport;
  const bounds = getDepartmentViewportBounds(
    viewport.viewportWidth || 0,
    viewport.viewportHeight || 0,
    viewport.contentWidth || 0,
    viewport.contentHeight || 0
  );

  return {
    x: clamp(offsetX, bounds.minX, bounds.maxX),
    y: clamp(offsetY, bounds.minY, bounds.maxY)
  };
}

function applyDepartmentViewport() {
  const flowWrap = $("departmentTaskFlowWrap");
  const flow = $("departmentTaskFlow");
  const svg = $("departmentTaskFlowLines");
  if (!flowWrap || !flow || !svg) return;

  const viewport = state.departmentViewport;
  viewport.viewportWidth = flowWrap.clientWidth || viewport.viewportWidth || 960;
  viewport.viewportHeight = flowWrap.clientHeight || viewport.viewportHeight || 560;

  const clamped = clampDepartmentViewport(viewport.offsetX, viewport.offsetY);
  viewport.offsetX = clamped.x;
  viewport.offsetY = clamped.y;

  const transform = `translate(${Math.round(viewport.offsetX)}px, ${Math.round(viewport.offsetY)}px)`;
  flow.style.transform = transform;
  svg.style.transform = transform;
}

function centerDepartmentViewportOnTask(task, layout) {
  const flowWrap = $("departmentTaskFlowWrap");
  if (!flowWrap || !task) return;

  const viewport = state.departmentViewport;
  viewport.viewportWidth = flowWrap.clientWidth || viewport.viewportWidth || 960;
  viewport.viewportHeight = flowWrap.clientHeight || viewport.viewportHeight || 560;
  viewport.offsetX = viewport.viewportWidth / 2 - (task.left + layout.nodeWidth / 2);
  viewport.offsetY = viewport.viewportHeight / 2 - (task.top + layout.nodeHeight / 2);
  viewport.initialized = true;

  applyDepartmentViewport();
}

function startDepartmentViewportDrag(clientX, clientY) {
  const flowWrap = $("departmentTaskFlowWrap");
  if (!flowWrap) return;

  const viewport = state.departmentViewport;
  viewport.isDragging = true;
  viewport.dragStartX = clientX;
  viewport.dragStartY = clientY;
  viewport.dragOriginX = viewport.offsetX;
  viewport.dragOriginY = viewport.offsetY;
  flowWrap.classList.add("dragging");
}

function updateDepartmentViewportDrag(clientX, clientY) {
  const viewport = state.departmentViewport;
  if (!viewport.isDragging) return;

  viewport.offsetX = viewport.dragOriginX + (clientX - viewport.dragStartX);
  viewport.offsetY = viewport.dragOriginY + (clientY - viewport.dragStartY);
  applyDepartmentViewport();
}

function stopDepartmentViewportDrag() {
  const flowWrap = $("departmentTaskFlowWrap");
  const viewport = state.departmentViewport;
  if (!viewport.isDragging) return;

  viewport.isDragging = false;
  if (flowWrap) {
    flowWrap.classList.remove("dragging");
  }
}

function ensureDepartmentTaskSelection() {
  const departments = getDepartmentNames();

  if (!departments.length) {
    state.currentDepartment = "";
    state.selectedDepartmentTaskId = "";
    return [];
  }

  if (!departments.includes(state.currentDepartment)) {
    state.currentDepartment = departments[0];
  }

  const tasks = getDepartmentTasks(state.currentDepartment);
  if (!tasks.some(task => task.taskId === state.selectedDepartmentTaskId)) {
    const taskIds = new Set(tasks.map(task => task.taskId));
    const firstRoot = tasks.find(task => !task.preTaskId || !taskIds.has(task.preTaskId));
    state.selectedDepartmentTaskId = firstRoot?.taskId || tasks[0]?.taskId || "";
  }

  return tasks;
}

function buildDepartmentTaskGraph(tasks) {
  const taskMap = new Map();

  tasks.forEach(task => {
    taskMap.set(task.taskId, {
      ...task,
      children: [],
      depth: 0,
      row: 0,
      left: 0,
      top: 0
    });
  });

  const sortTasks = (a, b) => {
    const seqDiff = (a.seq || 0) - (b.seq || 0);
    if (seqDiff !== 0) return seqDiff;

    const idDiff = toNumber(a.taskId) - toNumber(b.taskId);
    if (idDiff !== 0) return idDiff;

    return String(a.taskId).localeCompare(String(b.taskId), "zh-CN");
  };

  taskMap.forEach(task => {
    if (task.preTaskId && taskMap.has(task.preTaskId)) {
      taskMap.get(task.preTaskId).children.push(task.taskId);
    }
  });

  taskMap.forEach(task => {
    task.children.sort((leftId, rightId) => sortTasks(taskMap.get(leftId), taskMap.get(rightId)));
  });

  const roots = Array.from(taskMap.values())
    .filter(task => !task.preTaskId || !taskMap.has(task.preTaskId))
    .sort(sortTasks);

  function getDepth(taskId) {
    const task = taskMap.get(taskId);
    if (!task) return 0;

    if (!task.preTaskId || !taskMap.has(task.preTaskId)) {
      task.depth = 0;
      return 0;
    }

    if (task.depth > 0) {
      return task.depth;
    }

    task.depth = getDepth(task.preTaskId) + 1;
    return task.depth;
  }

  taskMap.forEach(task => {
    task.depth = getDepth(task.taskId);
  });

  let nextRow = 0;
  function assignRow(taskId) {
    const task = taskMap.get(taskId);
    if (!task) return 0;

    if (!task.children.length) {
      task.row = nextRow;
      nextRow += 1;
      return task.row;
    }

    const childRows = task.children.map(assignRow);
    task.row = (childRows[0] + childRows[childRows.length - 1]) / 2;
    return task.row;
  }

  roots.forEach((root, index) => {
    if (index > 0) nextRow += 1;
    assignRow(root.taskId);
  });

  const nodes = Array.from(taskMap.values()).sort((a, b) => {
    const depthDiff = a.depth - b.depth;
    if (depthDiff !== 0) return depthDiff;

    const rowDiff = a.row - b.row;
    if (rowDiff !== 0) return rowDiff;

    return sortTasks(a, b);
  });

  return {
    taskMap,
    roots,
    nodes,
    maxDepth: nodes.reduce((max, task) => Math.max(max, task.depth), 0),
    maxRow: nodes.reduce((max, task) => Math.max(max, task.row), 0)
  };
}

function getDepartmentRelatedTaskIds(graph, taskId) {
  const relatedIds = new Set();
  const startTask = graph.taskMap.get(taskId);

  if (!startTask) return relatedIds;

  function markAncestors(currentTask) {
    if (!currentTask || relatedIds.has(currentTask.taskId)) return;
    relatedIds.add(currentTask.taskId);

    if (currentTask.preTaskId && graph.taskMap.has(currentTask.preTaskId)) {
      markAncestors(graph.taskMap.get(currentTask.preTaskId));
    }
  }

  function markDescendants(currentTask) {
    if (!currentTask) return;
    relatedIds.add(currentTask.taskId);
    currentTask.children.forEach(childId => {
      markDescendants(graph.taskMap.get(childId));
    });
  }

  markAncestors(startTask);
  markDescendants(startTask);
  return relatedIds;
}

function getDepartmentSummary(department) {
  const tasks = getDepartmentTasks(department);
  const graph = buildDepartmentTaskGraph(tasks);
  const leafNames = graph.nodes.filter(task => !task.children.length).map(task => task.name);

  return {
    department,
    taskCount: tasks.length,
    rootNames: graph.roots.map(task => task.name),
    leafNames,
    branchCount: graph.nodes.filter(task => task.children.length > 1).length,
    rewards: getDepartmentRewardSummary(tasks)
  };
}

function selectDepartment(department) {
  if (!department || department === state.currentDepartment) return;

  state.currentDepartment = department;
  state.selectedDepartmentTaskId = "";
  renderDepartmentView();
}

function selectDepartmentTask(taskId) {
  const task = getDepartmentTaskById(taskId);
  if (!task) return;

  state.currentDepartment = task.department;
  state.selectedDepartmentTaskId = task.taskId;
  renderDepartmentView();
}

function renderDepartmentTabs() {
  const wrap = $("departmentTabList");
  if (!wrap) return;

  const departments = getDepartmentNames();
  if (!departments.length) {
    wrap.innerHTML = `<div class="department-empty-note">暂无部门任务数据</div>`;
    return;
  }

  wrap.innerHTML = departments.map(department => {
    const summary = getDepartmentSummary(department);
    const rewardPreview = summary.rewards
      .slice(0, 2)
      .map(reward => `${reward.name} ${formatMixedValue(reward.amount)}`)
      .join(" 路 ");

    return `
      <button
        type="button"
        class="department-tab-card ${department === state.currentDepartment ? "active" : ""}"
        data-department="${escapeHtml(department)}"
      >
        <span class="department-tab-name">${escapeHtml(department)}</span>
        <span class="department-tab-meta">${summary.taskCount} 个任务 · ${summary.branchCount} 个分支点</span>
        <span class="department-tab-reward">${escapeHtml(rewardPreview || "点击查看任务链路")}</span>
      </button>
    `;
  }).join("");
}

function renderDepartmentDetail() {
  const summaryText = $("departmentSummaryText");
  if (summaryText) {
    const departments = getDepartmentNames();
    summaryText.textContent = state.departmentTasks.length
      ? `共 ${departments.length} 个部门，${state.departmentTasks.length} 个任务节点`
      : "暂无部门任务数据";
  }

  const task = getDepartmentTaskById(state.selectedDepartmentTaskId);
  if (!task) {
    $("departmentTaskDetailName").textContent = "-";
    $("departmentTaskDetailDepartment").textContent = "-";
    $("departmentTaskDetailType").textContent = "-";
    $("departmentTaskDetailMap").textContent = "-";
    $("departmentTaskDetailPreTask").textContent = "-";
    $("departmentTaskDetailTarget").textContent = "-";
    $("departmentTaskDetailDescription").textContent = "点击左侧任务节点后，这里会显示详细信息。";

    const rewardWrap = $("departmentTaskDetailRewards");
    if (rewardWrap) {
      rewardWrap.innerHTML = `<div class="department-task-reward-empty">暂无奖励信息</div>`;
    }
    return;
  }

  $("departmentTaskDetailName").textContent = task.name || "-";
  $("departmentTaskDetailDepartment").textContent = task.department || "-";
  $("departmentTaskDetailType").textContent = task.type || "-";
  $("departmentTaskDetailMap").textContent = task.map || "-";
  $("departmentTaskDetailPreTask").textContent = getDepartmentTaskLabel(task.preTaskId, task.department);
  $("departmentTaskDetailTarget").textContent = getDepartmentTaskDisplayTarget(task);
  $("departmentTaskDetailDescription").textContent = task.description || "暂无任务描述";

  const rewardWrap = $("departmentTaskDetailRewards");
  if (rewardWrap) {
    rewardWrap.innerHTML = task.rewards.length
      ? task.rewards.map(reward => `
        <div class="department-task-reward-card">
          <div class="department-task-reward-icon">${escapeHtml(reward.name.slice(0, 2))}</div>
          <div class="department-task-reward-name">${escapeHtml(reward.name)}</div>
          <div class="department-task-reward-amount">${escapeHtml(formatMixedValue(reward.amount))}</div>
        </div>
      `).join("")
      : `<div class="department-task-reward-empty">暂无奖励信息</div>`;
  }
}

function renderDepartmentTaskFlow() {
  const titleEl = $("departmentGraphTitle");
  const subtitleEl = $("departmentGraphSubtitle");
  const flowWrap = $("departmentTaskFlowWrap");
  const flow = $("departmentTaskFlow");
  const svg = $("departmentTaskFlowLines");
  if (!titleEl || !subtitleEl || !flowWrap || !flow || !svg) return;

  const tasks = ensureDepartmentTaskSelection();
  if (!tasks.length) {
    state.departmentViewport.department = "";
    state.departmentViewport.initialized = false;
    titleEl.textContent = "暂无部门任务";
    subtitleEl.textContent = "请先在 data 中准备任务表";
    flow.style.width = "100%";
    flow.style.height = "100%";
    flow.style.transform = "translate(0px, 0px)";
    flow.innerHTML = `<div class="department-flow-empty">暂无部门任务数据</div>`;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", "0 0 1 1");
    svg.style.transform = "translate(0px, 0px)";
    return;
  }

  const graph = buildDepartmentTaskGraph(tasks);
  const selectedTask = graph.taskMap.get(state.selectedDepartmentTaskId) || graph.roots[0] || graph.nodes[0];
  if (selectedTask) {
    state.selectedDepartmentTaskId = selectedTask.taskId;
  }

  const relatedTaskIds = getDepartmentRelatedTaskIds(graph, state.selectedDepartmentTaskId);
  const layout = {
    nodeWidth: 240,
    nodeHeight: 74,
    columnGap: 56,
    rowGap: 52,
    paddingX: 32,
    paddingY: 36
  };

  graph.nodes.forEach(task => {
    task.left = layout.paddingX + task.row * (layout.nodeWidth + layout.columnGap);
    task.top = layout.paddingY + task.depth * (layout.nodeHeight + layout.rowGap);
  });

  const width = Math.max(
    flowWrap.clientWidth || 960,
    layout.paddingX * 2 + (Math.ceil(graph.maxRow) + 1) * layout.nodeWidth + Math.ceil(graph.maxRow) * layout.columnGap
  );
  const height = Math.max(
    flowWrap.clientHeight || 560,
    layout.paddingY * 2 + (graph.maxDepth + 1) * layout.nodeHeight + graph.maxDepth * layout.rowGap
  );

  titleEl.textContent = state.currentDepartment;
  subtitleEl.textContent = `共 ${tasks.length} 个任务节点 · ${graph.roots.length} 条起始链路 · 当前选中 ${selectedTask?.name || "-"}`;

  flow.style.width = `${width}px`;
  flow.style.height = `${height}px`;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  flow.innerHTML = graph.nodes.map(task => {
    const isSelected = task.taskId === state.selectedDepartmentTaskId;
    const isRelated = relatedTaskIds.has(task.taskId);

    return `
      <div
        class="department-task-node ${isSelected ? "selected" : ""} ${isRelated ? "related" : ""}"
        style="left:${task.left}px; top:${task.top}px;"
      >
        <button
          type="button"
          class="department-task-main"
          data-task-select="1"
          data-task-id="${escapeHtml(task.taskId)}"
        >
          <span class="department-task-accent"></span>
          <span class="department-task-copy">
            <span class="department-task-name">${escapeHtml(task.name)}</span>
            <span class="department-task-meta">${escapeHtml(task.type)}</span>
          </span>
        </button>
      </div>
    `;
  }).join("");

  svg.innerHTML = graph.nodes
    .filter(task => task.preTaskId && graph.taskMap.has(task.preTaskId))
    .map(task => {
      const parent = graph.taskMap.get(task.preTaskId);
      const startX = parent.left + layout.nodeWidth / 2;
      const startY = parent.top + layout.nodeHeight;
      const endX = task.left + layout.nodeWidth / 2;
      const endY = task.top;
      const middleY = Math.round((startY + endY) / 2);
      const isActive = relatedTaskIds.has(parent.taskId) && relatedTaskIds.has(task.taskId);

      return `
        <path
          class="department-task-line ${isActive ? "active" : ""}"
          d="M ${startX} ${startY} L ${startX} ${middleY} L ${endX} ${middleY} L ${endX} ${endY}"
        />
      `;
    })
    .join("");

  const viewport = state.departmentViewport;
  viewport.contentWidth = width;
  viewport.contentHeight = height;

  const focusRoot = graph.roots[0] || selectedTask || graph.nodes[0];
  const shouldCenterRoot =
    viewport.department !== state.currentDepartment ||
    !viewport.initialized;

  viewport.department = state.currentDepartment;

  if (shouldCenterRoot && focusRoot) {
    centerDepartmentViewportOnTask(focusRoot, layout);
  } else {
    applyDepartmentViewport();
  }
}

function renderDepartmentView() {
  ensureDepartmentTaskSelection();
  renderDepartmentTabs();
  renderDepartmentTaskFlow();
  renderDepartmentDetail();
}

function openDepartmentTaskDetail(taskId) {
  const task = getDepartmentTaskById(taskId);
  if (!task) return;

  state.currentDepartment = task.department;
  state.selectedDepartmentTaskId = task.taskId;
  renderDepartmentView();
}

function closeDepartmentTaskDetail() {
  state.selectedDepartmentTaskId = "";
  renderDepartmentView();
}

/* =========================================================
 * 二十六、渲染 - 交易记录
 * ========================================================= */
function renderRecordTable() {}

function renderAll() {}

function switchTab(tab) {
  state.currentTab = tab;
}

function bindEvents() {}
function bindEvents() {
  document.querySelectorAll(".market-tab").forEach(button => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });

  document.querySelectorAll(".top-nav .nav-item[data-view]").forEach(item => {
    item.addEventListener("click", () => {
      switchView(item.dataset.view);
    });
  });

  bind("departmentTabList", "click", event => {
    const button = event.target.closest(".department-tab-card");
    if (!button) return;
    selectDepartment(button.dataset.department);
  });

  bind("departmentTaskFlow", "click", event => {
    const taskButton = event.target.closest("[data-task-select]");
    if (taskButton) {
      selectDepartmentTask(taskButton.dataset.taskId);
    }
  });

  bind("departmentTaskFlowWrap", "mousedown", event => {
    if (event.button !== 0) return;
    if (event.target.closest(".department-task-main")) return;

    event.preventDefault();
    startDepartmentViewportDrag(event.clientX, event.clientY);
  });

  bind("departmentTaskFlowWrap", "touchstart", event => {
    if (event.target.closest(".department-task-main")) return;
    const touch = event.touches?.[0];
    if (!touch) return;

    startDepartmentViewportDrag(touch.clientX, touch.clientY);
  });

  document.addEventListener("mousemove", event => {
    if (!state.departmentViewport.isDragging) return;
    event.preventDefault();
    updateDepartmentViewportDrag(event.clientX, event.clientY);
  });

  document.addEventListener("mouseup", () => {
    stopDepartmentViewportDrag();
  });

  document.addEventListener("touchmove", event => {
    if (!state.departmentViewport.isDragging) return;
    const touch = event.touches?.[0];
    if (!touch) return;

    event.preventDefault();
    updateDepartmentViewportDrag(touch.clientX, touch.clientY);
  }, { passive: false });

  document.addEventListener("touchend", () => {
    stopDepartmentViewportDrag();
  });

  document.addEventListener("touchcancel", () => {
    stopDepartmentViewportDrag();
  });

  window.addEventListener("resize", () => {
    if (state.currentView === "department") {
      state.departmentViewport.initialized = false;
      renderDepartmentView();
    }
  });

  window.addEventListener("blur", () => {
    stopDepartmentViewportDrag();
  });

  bind("searchInput", "input", event => {
    state.keyword = event.target.value.trim();
    renderAll();
  });

  bind("reloadStaticBtn", "click", () => {
    loadStaticData();
    showMessageModal("读取完成", "已重新读取当前静态数据。");
  });

  bind("clearRecordBtn", "click", () => {
    showConfirmModal("确认清空", "确定要清空全部交易记录吗？", () => {
      state.records = [];
      saveState();
      renderAll();
      closeModal();
      showMessageModal("清空成功", "交易记录已清空。");
    });
  });

  bind("addGoldBtn", "click", () => {
    addCustomGold();
  });

  bind("goldAmountInput", "blur", event => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) {
      event.target.value = DEFAULT_ADD_GOLD;
    }
  });

  bind("goSellTabBtn", "click", () => {
    goToTradeSellTab();
  });

  bind("modalCancelBtn", "click", () => {
    closeModal();
  });

  bind("modalConfirmBtn", "click", () => {
    if (typeof state.modalConfirmHandler === "function") {
      state.modalConfirmHandler();
    } else {
      closeModal();
    }
  });

  bind("modalMask", "click", event => {
    if (event.target.id === "modalMask") {
      closeModal();
    }
  });

  bind("closeItemDetailBtn", "click", () => {
    closeItemDetail();
  });

  bind("itemDetailMask", "click", event => {
    if (event.target.id === "itemDetailMask") {
      closeItemDetail();
    }
  });

  bind("listingEditorCloseBtn", "click", () => {
    closeListingEditor();
  });

  bind("openTrendModalBtn", "click", () => {
    openTrendModal();
  });

  bind("closeTrendModalBtn", "click", event => {
    event.preventDefault();
    event.stopPropagation();
    closeTrendModal();
  });

  bind("trendModalMask", "click", event => {
    if (event.target.id === "trendModalMask") {
      closeTrendModal();
    }
  });

  bind("listingEditorMask", "click", event => {
    if (event.target.id === "listingEditorMask") {
      closeListingEditor();
    }
  });

  bind("listingQtyMinusBtn", "click", () => {
    changeDraftQuantity(-1);
  });

  bind("listingQtyPlusBtn", "click", () => {
    changeDraftQuantity(1);
  });

  bind("listingQtyRange", "input", event => {
    setDraftQuantity(event.target.value);
  });

  bind("listingPriceMinusBtn", "click", () => {
    decreaseDraftPrice();
  });

  bind("listingPricePlusBtn", "click", () => {
    increaseDraftPrice();
  });

  bind("listingPriceInput", "blur", event => {
    setDraftPrice(event.target.value);
  });

  bind("listingDetailToggleBtn", "click", () => {
    toggleDraftDetail();
  });

  bind("listingConfirmBtn", "click", () => {
    confirmListing();
  });

  bind("closeListingViewBtn", "click", () => {
    closeListingView();
  });

  bind("listingViewMask", "click", event => {
    if (event.target.id === "listingViewMask") {
      closeListingView();
    }
  });
}

function renderListingPriceChart(info, targetId = "listingPriceChart") {
  const chart = $(targetId);
  if (!chart) return;

  const bars = buildListingPriceBars(info);
  chart.style.gridTemplateColumns = `repeat(${bars.length}, minmax(0, 1fr))`;

  chart.innerHTML = bars.map(bar => `
    <div class="listing-bar-item ${bar.isActive ? "active" : ""}">
      <div class="listing-bar-top">${formatMoney(bar.upperBound)}</div>
      <div class="listing-bar-wrap">
        <div class="listing-bar-fill" style="height:${bar.height}%;"></div>
      </div>
      <div class="listing-bar-bottom">${formatMoney(bar.upperBound)}</div>
    </div>
  `).join("");
}

function performBuyItem(id) {
  const item = state.items.find(entry => entry.id === id);
  if (!item) return;

  if (state.gold < item.buyPrice) {
    showMessageModal("金币不足", `当前金币不足，无法购买「${item.name}」。`);
    return;
  }

  state.gold -= item.buyPrice;
  state.inventory[id] = (state.inventory[id] || 0) + 1;

  addRecord("购买", item.name, item.buyPrice, 1, {
    itemId: item.id,
    category: item.category,
    quality: item.quality,
    side: "buy"
  });
  saveState();
  renderAll();

  showMessageModal(
    "购买成功",
    `你已成功购买「${item.name}」。\n已放入仓库。\n消耗金币：${formatMoney(item.buyPrice)}\n当前金币：${formatMoney(state.gold)}`
  );
}

function performSellItem(id) {
  const item = state.items.find(entry => entry.id === id);
  if (!item) return;

  const count = state.inventory[id] || 0;
  if (count <= 0) {
    showMessageModal("出售失败", `仓库中没有「${item.name}」，无法出售。`);
    return;
  }

  state.inventory[id] -= 1;
  if (state.inventory[id] <= 0) {
    delete state.inventory[id];
  }

  state.gold += item.sellPrice;

  addRecord("出售", item.name, item.sellPrice, 1, {
    itemId: item.id,
    category: item.category,
    quality: item.quality,
    side: "sell"
  });
  saveState();
  renderAll();

  showMessageModal(
    "出售成功",
    `你已成功出售「${item.name}」。\n获得金币：${formatMoney(item.sellPrice)}\n当前金币：${formatMoney(state.gold)}`
  );
}

function renderRecordColumn(listId, records, emptyText) {
  const wrap = $(listId);
  if (!wrap) return;

  if (!records.length) {
    wrap.innerHTML = `<div class="empty-block">${emptyText}</div>`;
    return;
  }

  wrap.innerHTML = records.map(record => {
    const item = getRecordItem(record);
    const metaText = item
      ? `${item.category || "-"} / ${item.quality || "-"}`
      : (record.category || record.quality
        ? `${record.category || "-"} / ${record.quality || "-"}`
        : "交易物品");
    const actionText = record.side === "buy" ? "买入" : "卖出";

    return `
      <div class="record-card">
        <div class="record-card-copy">
          <div class="record-card-name">${escapeHtml(record.itemName)}</div>
          <div class="record-card-meta">${escapeHtml(metaText)}</div>
          <div class="record-card-stats">数量 ${record.count}</div>
        </div>

        <div class="record-card-image">交易物品</div>

        <div class="record-card-side">
          <div class="record-card-time">${formatDateTime(record.timeMs || record.time)}</div>
          <div class="record-card-action">${actionText}</div>
          <div class="record-card-price">${formatMoney(record.price)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderRecordTable() {
  const sortedRecords = state.records
    .slice()
    .sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));

  const buyRecords = sortedRecords.filter(record => record.side === "buy");
  const sellRecords = sortedRecords.filter(record => record.side === "sell");

  renderRecordColumn("recordBuyList", buyRecords, "暂无购买记录");
  renderRecordColumn("recordSellList", sellRecords, "暂无出售记录");
}

function switchView(view) {
  const nextView = ["trade", "warehouse", "department"].includes(view) ? view : "trade";
  const viewChanged = state.currentView !== nextView;
  state.currentView = nextView;

  const tradeView = $("tradeView");
  const warehouseView = $("warehouseView");
  const departmentView = $("departmentView");

  if (tradeView) tradeView.classList.toggle("active", nextView === "trade");
  if (warehouseView) warehouseView.classList.toggle("active", nextView === "warehouse");
  if (departmentView) departmentView.classList.toggle("active", nextView === "department");

  document.querySelectorAll(".top-nav .nav-item[data-view]").forEach(item => {
    item.classList.toggle("active", item.dataset.view === nextView);
  });

  if (nextView === "trade") {
    switchTab(state.currentTab || "buy");
  }

  if (nextView === "warehouse" && viewChanged) {
    renderWarehouseGrid();
  }

  if (nextView === "department" && viewChanged) {
    state.departmentViewport.initialized = false;
    renderDepartmentView();
  }
}

function goToTradeSellTab() {
  switchView("trade");
  switchTab("sell");
}

function goToWarehouseView() {
  switchView("warehouse");
}

function goToDepartmentView() {
  switchView("department");
}

function switchTab(tab) {
  state.currentTab = tab;

  document.querySelectorAll(".market-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  const buyPanel = $("buyPanel");
  const sellPanel = $("sellPanel");
  const recordPanel = $("recordPanel");
  const marketLayout = $("marketLayout");
  const tradeSidebar = $("tradeSidebar");
  const showSidebar = tab === "buy";

  if (buyPanel) buyPanel.classList.toggle("active", tab === "buy");
  if (sellPanel) sellPanel.classList.toggle("active", tab === "sell");
  if (recordPanel) recordPanel.classList.toggle("active", tab === "record");
  if (marketLayout) marketLayout.classList.toggle("sidebar-hidden", !showSidebar);
  if (tradeSidebar) tradeSidebar.classList.toggle("hidden", !showSidebar);
}

function renderAll() {
  removeExpiredListings();
  updateGoldText();
  renderListingSlotLimitTip();
  renderBuyGrid();
  renderListingShelf();
  renderSellGrid();
  renderWarehouseGrid();
  renderRecordTable();
  renderDepartmentView();

  if (state.listingDraft) {
    renderListingEditor();
  }

  renderListingDetailView();
}

function renderListingDetailView(listingId = state.activeListingDetailId) {
  const mask = $("listingViewMask");
  if (!mask || !listingId) return;

  const listing = state.listings.find(entry => entry.listingId === listingId);
  if (!listing) {
    closeListingView();
    return;
  }

  const item = getListingItem(listing);
  const info = calculateListingInfo(item, listing.perItemPrice, listing.quantity);

  $("listingViewName").textContent = listing.name || "-";
  $("listingViewCategory").textContent = `${item.category || listing.category || "-"} / ${item.quality || listing.quality || "-"}`;
  $("listingViewLowestPriceText").textContent = formatMoney(info.referencePrice);
  $("listingViewCreatedAt").textContent = formatDateTime(listing.createdAtTs || listing.createdAt);
  $("listingViewRemainText").textContent = formatCountdown(getListingExpireRemainingMs(listing));
  $("listingViewQuantityText").textContent = `${listing.quantity || 1}`;
  $("listingViewPerPrice").textContent = formatMoney(listing.perItemPrice);
  $("listingViewSaleTotal").textContent = formatMoney(listing.totalPrice);
  $("listingViewFeeText").textContent = formatMoney(listing.fee);
  $("listingViewDepositText").textContent = formatMoney(listing.deposit);
  $("listingViewExpectedText").textContent = formatMoney(listing.expectedReceive);

  renderListingPriceChart(info, "listingViewPriceChart");
}

function showListingDetail(listingId) {
  const listing = state.listings.find(entry => entry.listingId === listingId);
  if (!listing) return;

  state.activeListingDetailId = listingId;
  const mask = $("listingViewMask");
  if (mask) {
    mask.classList.add("show");
  }

  renderListingDetailView(listingId);
}

function closeListingView() {
  const mask = $("listingViewMask");
  if (mask) {
    mask.classList.remove("show");
  }

  state.activeListingDetailId = "";
}

function unlistItem(listingId) {
  const listing = state.listings.find(entry => entry.listingId === listingId);
  if (!listing) return;

  showConfirmModal(
    "确认下架",
    `确定要下架「${listing.name}」吗？\n下架后物品会退回仓库，但本次挂单保证金不返还。`,
    () => {
      closeModal();

      state.inventory[listing.itemId] = (state.inventory[listing.itemId] || 0) + Math.max(1, toNumber(listing.quantity) || 1);
      state.listings = state.listings.filter(entry => entry.listingId !== listingId);

      if (state.activeListingDetailId === listingId) {
        closeListingView();
      }

      addRecord("下架", listing.name, listing.perItemPrice, listing.quantity, {
        itemId: listing.itemId,
        category: listing.category,
        quality: listing.quality,
        side: "system"
      });
      saveState();
      renderAll();

      showMessageModal(
        "下架成功",
        `「${listing.name}」已下架并退回仓库。\n退回数量：${listing.quantity}\n保证金未返还。`
      );
    }
  );
}

function confirmListing() {
  const info = getDraftInfo();
  if (!info) return;

  const item = info.item;
  const blockedState = getListingBlockedState(info);
  if (blockedState) {
    showMessageModal(blockedState.title, blockedState.message);
    return;
  }

  state.gold -= info.deposit;
  state.inventory[item.id] -= info.quantity;
  if (state.inventory[item.id] <= 0) {
    delete state.inventory[item.id];
  }

  const createdAtTs = Date.now();
  const createdAt = formatDateTime(createdAtTs);
  const expireAtTs = createdAtTs + LISTING_DURATION_MS;
  const listingRule = getListingSystemRecycleRule({
    itemId: item.id,
    quantity: 1,
    perItemPrice: info.perItemPrice
  });
  const systemRecycleAtTs = listingRule.recycleDelayMs ? (createdAtTs + listingRule.recycleDelayMs) : 0;

  const listings = Array.from({ length: info.quantity }, () => ({
    listingId: makeListingId(),
    itemId: item.id,
    name: item.name,
    category: item.category,
    quality: item.quality,
    quantity: 1,
    perItemPrice: info.perItemPrice,
    perItemDeposit: info.perItemDeposit,
    perItemFee: info.perItemFee,
    perItemExpectedReceive: info.perItemExpectedReceive,
    feeIndex: info.feeIndex,
    feeRate: info.feeRate,
    totalPrice: info.perItemPrice,
    deposit: info.perItemDeposit,
    fee: info.perItemFee,
    expectedReceive: info.perItemExpectedReceive,
    createdAtTs,
    expireAtTs,
    createdAt,
    priceBarIndex: listingRule.barIndex,
    systemRecycleRuleType: listingRule.ruleType,
    systemRecycleAtTs
  }));

  state.listings.push(...listings);

  addRecord("上架", item.name, info.currentPrice, info.quantity, {
    itemId: item.id,
    category: item.category,
    quality: item.quality,
    side: "system"
  });
  saveState();
  closeListingEditor();
  renderAll();

  showMessageModal(
    "上架成功",
    `你已成功上架「${item.name}」。\n上架数量：${info.quantity}\n单件价格：${formatMoney(info.currentPrice)}\n本次支付保证金：${formatMoney(info.deposit)}\n当前售位：${getUsedListingSlots()}/${getListingSlotLimit()}`
  );
}

function renderListingShelf() {
  const wrap = $("listingShelfGrid");
  const countText = $("listingSlotCountText");
  if (!wrap || !countText) return;

  const slotLimit = getListingSlotLimit();
  const usedSlots = getUsedListingSlots();
  const availableSlots = Math.max(0, slotLimit - usedSlots);
  countText.textContent = `${usedSlots}/${slotLimit}`;

  const cards = state.listings.map(listing => `
    <div class="listing-slot filled">
      <div class="listing-slot-layout">
        <div class="listing-slot-left">
          <div class="listing-slot-topline">
            <span class="listing-slot-name">${escapeHtml(listing.name)}</span>
          </div>

          <div class="listing-slot-preview-row">
            <div class="listing-slot-image">物品图片</div>
            <div class="listing-slot-meta">
              <div class="listing-slot-meta-row">
                <span>数量</span>
                <span>${listing.quantity}</span>
              </div>
              <div class="listing-slot-meta-row price">
                <span>出售价格</span>
                <span>${formatMoney(listing.perItemPrice)}</span>
              </div>
            </div>
          </div>

          <span class="quality-badge q-${listing.quality || "白"}">${listing.quality || "-"}</span>
        </div>

        <div class="listing-slot-right">
          <div class="listing-slot-countdown">
            <span class="listing-slot-clock">◔</span>
            <span class="listing-slot-timer">${formatCountdown(getListingExpireRemainingMs(listing))}</span>
          </div>

          <div class="listing-slot-actions vertical">
            <button class="card-btn info" onclick="showListingDetail('${listing.listingId}')">查看</button>
            <button class="card-btn sell" onclick="unlistItem('${listing.listingId}')">下架</button>
          </div>
        </div>
      </div>
    </div>
  `);

  if (availableSlots > 0) {
    cards.push(
      ...Array.from({ length: availableSlots }, () => `
        <div class="listing-slot empty">
          <div class="listing-slot-empty-text">待上架</div>
        </div>
      `)
    );
  } else {
    cards.push(`
      <div class="listing-slot slot-upgrade">
        <div class="listing-slot-upgrade-title">增加槽位</div>
        <div class="listing-slot-upgrade-price">每个 ${formatMoney(LISTING_SLOT_PRICE)} 金币</div>
        <button class="card-btn info slot-upgrade-btn" onclick="buyListingSlot()">购买 1 个新槽位</button>
      </div>
    `);
  }

  wrap.innerHTML = cards.join("");
}

function init() {
  bindEvents();
  startListingTicker();
  updateGoldText();
  loadStaticData();
  switchView("trade");
  switchTab("buy");

  const goldInput = $("goldAmountInput");
  if (goldInput && !goldInput.value) {
    goldInput.value = DEFAULT_ADD_GOLD;
  }
}

// 鍚姩
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}


/* =========================================================
 * 三十三、挂到 window
 * 这样 HTML 里的 onclick 才能直接调用
 * ========================================================= */
window.buyItem = buyItem;
window.sellItem = sellItem;
window.openListingEditor = openListingEditor;
window.showListingDetail = showListingDetail;
window.unlistItem = unlistItem;
window.goToTradeSellTab = goToTradeSellTab;
window.goToWarehouseView = goToWarehouseView;
window.goToDepartmentView = goToDepartmentView;
window.openTrendModal = openTrendModal;
window.closeTrendModal = closeTrendModal;
// 兼容旧版本代码里可能还在使用的名称
window.openListingInfo = openListingEditor;
window.openItemDetail = openItemDetail;
window.closeItemDetail = closeItemDetail;
window.handleItemDetailCardClick = handleItemDetailCardClick;
window.handleListingEditorCardClick = handleListingEditorCardClick;
window.buyListingSlot = buyListingSlot;
window.closeDepartmentTaskDetail = closeDepartmentTaskDetail;

