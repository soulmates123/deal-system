/* =========================================================
 * 浜ゆ槗琛岀郴缁?- 瀹屾暣鏈€缁堢増 app.js
 *
 * 杩欑増鍖呭惈锛?
 * 1. 璐拱椤碉細鎸夐潤鎬佽〃浠锋牸璐拱锛屼拱瀹岃繘浠撳簱
 * 2. 浠撳簱椤碉細鏌ョ湅搴撳瓨銆佺洿鎺ュ嚭鍞紙绯荤粺鍥炴敹锛夈€佽繘鍏ヤ氦鏄撹涓婃灦
 * 3. 浜ゆ槗琛屽嚭鍞〉锛?
 *    - 宸﹁竟锛氫笂鏋舵灦瀛愶紙鏈€澶?10 涓寕鍗曪級
 *    - 鍙宠竟锛氫粨搴撴墍鏈夊彲涓婃灦鐗╁搧
 *    - 鐐瑰嚮鐗╁搧鍗＄墖鍙洿鎺ュ脊鍑轰笂鏋剁晫闈?
 * 4. 涓婃灦缂栬緫鍣細
 *    - 鏁伴噺 <= 浠撳簱搴撳瓨
 *    - 浠锋牸鏀寔 + / -
 *    - 浠锋牸浣庝簬鏈€浣庡敭浠锋椂鑷姩淇涓烘渶浣庡敭浠?
 *    - 鐐瑰嚮 ? 灞曞紑璇︽儏
 * 5. 浜ゆ槗璁板綍椤?
 * 6. 椤堕儴鎵嬪姩鍔犻噾甯?
 *
 * ---------------------------------------------------------
 * 浣犲綋鍓嶇‘璁よ繃鐨勬牳蹇冭绠楄鍒欙細
 *
 * 璁撅細
 *   a = 鐜╁杈撳叆鐨勨€滃崟浠朵笂鏋朵环鈥?
 *   q = 涓婃灦鏁伴噺
 *
 * 娉ㄦ剰锛?
 * - 澶氫欢涓婃灦鏃讹紝涓嶆槸鎷?(a * q) 閲嶆柊鍒ゅ畾鎵嬬画璐圭巼
 * - 鑰屾槸鍏堟寜鈥滃崟浠垛€濈畻锛屽啀鎶婄粨鏋滀箻鏁伴噺
 * - 鍚屼竴绉嶇墿鍝佷竴娆′笂鏋跺浠讹紝鏈川涓婂彧鏄渷鍘讳竴涓釜涓婃灦姝ラ
 * - 鏈€缁堜粛鐒跺彧鍗犵敤 1 涓灦瀛?
 *
 * 鍗曚欢璁＄畻锛?
 *   鍗曚欢淇濊瘉閲?= max(鏈€浣庝繚璇侀噾, a * 3%)
 *   鎵嬬画璐瑰簭鍙?= floor(round(a / 鍗曚欢淇濊瘉閲? 0) / 10)
 *   鍗曚欢鎵嬬画璐圭巼 = 鎵嬬画璐硅〃[鎵嬬画璐瑰簭鍙穄
 *   鍗曚欢鎵嬬画璐?= a * 鎵嬬画璐圭巼
 *   鍗曚欢棰勬湡鏀跺叆 = a - 鍗曚欢淇濊瘉閲?- 鍗曚欢鎵嬬画璐?
 *
 * 鍚堣灞曠ず锛?
 *   鍑哄敭鎬讳环 = a * q
 *   鎬讳繚璇侀噾 = 鍗曚欢淇濊瘉閲?* q
 *   鎬绘墜缁垂 = 鍗曚欢鎵嬬画璐?* q
 *   鎬婚鏈熸敹鍏?= 鍗曚欢棰勬湡鏀跺叆 * q
 * ========================================================= */


/* =========================================================
 * 涓€銆佹湰鍦板瓨鍌?key
 * 鐢ㄦ潵鎶婇噾甯?/ 浠撳簱搴撳瓨 / 浜ゆ槗璁板綍 / 涓婃灦鍒楄〃淇濆瓨鍦ㄦ祻瑙堝櫒閲?
 * ========================================================= */
const STORAGE_KEYS = {
  gold: "trade_static_gold",
  inventory: "trade_static_inventory",
  records: "trade_static_records",
  listings: "trade_static_listings",
  listingSlotLimit: "trade_static_listing_slot_limit"
};


/* =========================================================
 * 浜屻€佸熀纭€甯搁噺
 * ========================================================= */

// 椤堕儴鈥?閲戝竵鈥濊緭鍏ユ榛樿鍊?
const DEFAULT_ADD_GOLD = 10000000;

// 鏈€澶у悓鏃朵笂鏋朵綅
const DEFAULT_LISTING_SLOTS = 10;
const LISTING_SLOT_PRICE = 10000000;
const LISTING_DURATION_MS = 24 * 60 * 60 * 1000;
const LISTING_PRICE_BAR_COUNT = 9;
const LISTING_PRICE_VISIBLE_BAR_COUNT = 5;
const LISTING_PRICE_BAR_CENTER_INDEX = 4;
const LISTING_PRICE_BAR_INTERVAL_RATE = 0.0033554794980203;

// 鍝佽川鎺掑簭锛氱孩 -> 閲?-> 绱?-> 钃?-> 缁?-> 鐧?
const QUALITY_SORT_ORDER = {
  "红": 0,
  "金": 1,
  "紫": 2,
  "蓝": 3,
  "绿": 4,
  "白": 5
};


/* =========================================================
 * 涓夈€佸熀纭€宸ュ叿鍑芥暟
 * ========================================================= */

/**
 * 绠€鍐?document.getElementById
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * 瀹夊叏缁戝畾浜嬩欢
 * 濡傛灉鍏冪礌涓嶅瓨鍦紝涓嶄細鎶ラ敊
 */
function bind(id, eventName, handler) {
  const el = $(id);
  if (el) {
    el.addEventListener(eventName, handler);
  }
}

/**
 * 閲戦鏍煎紡鍖?
 * 渚嬪锛?000000 -> 1,000,000
 */
function formatMoney(num) {
  return Number(num || 0).toLocaleString("zh-CN");
}

/**
 * 杞瓧绗︿覆骞跺幓鎺夊墠鍚庣┖鏍?
 */
function toText(value) {
  return String(value ?? "").trim();
}

/**
 * 杞暟瀛?
 * 浼氳嚜鍔ㄥ幓鎺夐€楀彿 / 绌烘牸锛屽吋瀹?Excel 瀵煎嚭鏍煎紡
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
 * 闄愬埗鏁板€煎湪 min ~ max 涔嬮棿
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
  if (type === "璐拱") return "buy";
  if (type === "鍑哄敭") return "sell";
  return "system";
}

function parseStoredTimeMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return 0;

  const text = String(value).trim();
  if (!text) return 0;

  const normalized = text.replace(/[^\\d:/.\\-\\s]/g, " ").replace(/\\./g, "-").replace(/\\s+/g, " ").trim();
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

function getListingRemainingMs(listing, now = Date.now()) {
  const expireAtTs = parseStoredTimeMs(listing?.expireAtTs);
  if (!expireAtTs) return 0;
  return Math.max(0, expireAtTs - now);
}

/**
 * 鐢熸垚涓€涓寕鍗?id
 */
function makeListingId() {
  return `listing_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

/**
 * 鑾峰彇鍝佽川鎺掑簭鍊?
 * 鏈煡鍝佽川榛樿鎺掑埌鏈€鍚?
 */
function getQualitySortValue(quality) {
  return QUALITY_SORT_ORDER[quality] ?? 999;
}

// 鍏煎鏃у瓨妗ｏ細鎶婂巻鍙蹭笂鈥渜uantity > 1 鐨勫悎骞舵寕鍗曗€濇媶鎴愬涓崟浠舵寕鍗曘€?// 杩欐牱宸︿晶鏋跺瓙濮嬬粓鎸?1 浠?1 鍗″睍绀猴紝鍚庨潰鐨勪笂鏋?涓嬫灦閫昏緫涔熸洿缁熶竴銆?
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
 * 鍥涖€佸叏灞€鐘舵€?state
 * ========================================================= */

const state = {
  // 浠?items-data.js 璇诲嚭鏉ョ殑鐗╁搧琛?
  items: [],

  // 浠?items-data.js 璇诲嚭鏉ョ殑鎵嬬画璐硅鍒欒〃
  serviceChargeRules: [],

  // 褰撳墠閲戝竵
  gold: Number(localStorage.getItem(STORAGE_KEYS.gold)) || 314381,

  // 浠撳簱搴撳瓨
  // 缁撴瀯锛歿 itemId: count, ... }
  inventory: JSON.parse(localStorage.getItem(STORAGE_KEYS.inventory) || "{}"),

  // 浜ゆ槗璁板綍
  records: normalizeRecords(JSON.parse(localStorage.getItem(STORAGE_KEYS.records) || "[]")),

  // 褰撳墠鎸傚崟鍒楄〃
  // 涓€涓寕鍗曞崰涓€涓灦瀛?
  listings: normalizeListings(JSON.parse(localStorage.getItem(STORAGE_KEYS.listings) || "[]")),

  listingSlotLimit: Math.max(
    DEFAULT_LISTING_SLOTS,
    Number(localStorage.getItem(STORAGE_KEYS.listingSlotLimit)) || DEFAULT_LISTING_SLOTS
  ),

  departmentTasks: [],

  // 褰撳墠涓昏鍥撅細trade / warehouse / department
  currentView: "trade",

  currentDepartment: "",
  selectedDepartmentTaskId: "",

  // 褰撳墠浜ゆ槗琛岄〉绛撅細buy / sell / record
  currentTab: "buy",

  // 宸︿晶绛涢€?
  currentCategory: "",
  currentQuality: "",
  keyword: "",

  // 閫氱敤寮圭獥鈥滅‘璁も€濇寜閽殑鍥炶皟
  modalConfirmHandler: null,

  // 褰撳墠涓婃灦缂栬緫鍣ㄨ崏绋?
  // 缁撴瀯绀轰緥锛?
  // {
  //   itemId: "1001",
  //   quantity: 1,
  //   currentPrice: 326505,
  //   showDetail: false
  // }
  listingDraft: null,
  activeListingDetailId: "",
  listingTicker: null
};


/* =========================================================
 * 浜斻€佹湰鍦版寔涔呭寲
 * ========================================================= */

/**
 * 鎶婂綋鍓嶉噾甯?/ 浠撳簱 / 璁板綍 / 鎸傚崟淇濆瓨鍒版祻瑙堝櫒鏈湴
 */
function saveState() {
  localStorage.setItem(STORAGE_KEYS.gold, state.gold);
  localStorage.setItem(STORAGE_KEYS.inventory, JSON.stringify(state.inventory));
  localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(state.records));
  localStorage.setItem(STORAGE_KEYS.listings, JSON.stringify(state.listings));
  localStorage.setItem(STORAGE_KEYS.listingSlotLimit, String(getListingSlotLimit()));
}


/* =========================================================
 * 鍏€佹暟鎹鑼冨寲
 * 浠?items-data.js 璇诲埌鐨勫叏灞€鍙橀噺閲屾暣鐞嗘垚鍓嶇缁熶竴缁撴瀯
 * ========================================================= */

/**
 * 瑙勮寖鍖栫墿鍝佽〃
 * 璁╂瘡涓墿鍝佽嚦灏戞湁杩欎簺瀛楁锛?
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
 * feeRate 濡傛灉鏄?15.58 杩欑锛岃浆鎴?0.1558
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
 * 鏍规嵁鎵嬬画璐瑰簭鍙锋嬁鎵嬬画璐圭巼
 * 濡傛灉鍒氬ソ鏈夊搴斿簭鍙凤紝鐩存帴杩斿洖
 * 濡傛灉娌℃湁锛?
 * - 灏忎簬鏈€灏忓簭鍙凤細杩斿洖绗竴鏉?
 * - 澶т簬鏈€澶у簭鍙凤細杩斿洖鏈€鍚庝竴鏉?
 */
function getFeeRateByIndex(feeIndex) {
  const rules = state.serviceChargeRules;

  // 濡傛灉鎵嬬画璐硅〃娌¤鍒帮紝鐩存帴鎶ラ敊鎻愮ず
  if (!rules.length) {
    console.warn("[鎵嬬画璐硅鍒欎负绌篯 state.serviceChargeRules 娌℃湁璇诲埌鏁版嵁");
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
 * 涓冦€佷环鏍肩浉鍏宠鍒?
 * ========================================================= */

/**
 * 鍙傝€冧环鏍?
 * 浼樺厛浣跨敤鍒濆瀹氫环 initialPrice
 */
function getReferencePrice(item) {
  return item.initialPrice || item.buyPrice || 0;
}

/**
 * 鏈€浣庡彲涓婃灦浠锋牸 = 鍒濆瀹氫环 * 15%
 */
function getMinListPrice(item) {
  return Math.max(1, Math.round(getReferencePrice(item) * 0.15));
}

/**
 * 鏈€楂樺彲涓婃灦浠锋牸 = 鍒濆瀹氫环 * 1500%
 * 鍗?* 15
 */
function getMaxListPrice(item) {
  return Math.max(getMinListPrice(item), Math.round(getReferencePrice(item) * 15));
}

/**
 * 褰撳墠宸蹭娇鐢ㄥ敭浣?
 * 鐜板湪鐩存帴绛変簬鎸傚崟鏁伴噺
 */
function getUsedListingSlots() {
  // 鐢ㄦ暟閲忔眰鍜岃€屼笉鏄洿鎺ョ敤鎸傚崟鏉℃暟锛岃兘鍏煎鏃ф暟鎹紝涔熷拰鈥? 浠跺崰 1 妲戒綅鈥濈殑瑙勫垯涓€鑷淬€?  return state.listings.reduce((sum, listing) => sum + Math.max(0, toNumber(listing.quantity)), 0);
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
    name: listing?.name || "鏈煡鐗╁搧",
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
  const expiredListings = state.listings.filter(listing => getListingRemainingMs(listing, now) <= 0);
  if (!expiredListings.length) return false;

  const expiredIds = new Set(expiredListings.map(listing => listing.listingId));

  expiredListings.forEach(listing => {
    state.inventory[listing.itemId] = (state.inventory[listing.itemId] || 0) + Math.max(1, toNumber(listing.quantity) || 1);
    state.records.unshift(createRecordEntry("杩囨湡涓嬫灦", listing.name, listing.perItemPrice, listing.quantity, {
      itemId: listing.itemId,
      category: listing.category,
      quality: listing.quality,
      side: "system"
    }));
  });

  state.listings = state.listings.filter(listing => !expiredIds.has(listing.listingId));

  if (state.activeListingDetailId && expiredIds.has(state.activeListingDetailId)) {
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
 * 鍏€佹牳蹇冭绠楋細涓婃灦淇℃伅
 *
 * 鎸変綘鏈€鏂扮‘璁ょ殑瑙勫垯锛?
 * - a = 鐜╁杈撳叆鐨勨€滃崟浠朵笂鏋朵环鈥?
 * - q = 涓婃灦鏁伴噺
 * - 澶氫欢涓婃灦鏃讹紝鍏堟寜鍗曚欢绠楋紝鍐嶄箻鏁伴噺
 * ========================================================= */
function calculateListingInfo(item, currentPrice, quantity = 1) {
  const referencePrice = getReferencePrice(item);
  const minPrice = getMinListPrice(item);
  const maxPrice = getMaxListPrice(item);

  const fixedPrice = clamp(Math.round(currentPrice), minPrice, maxPrice);
  const isPriceValid = fixedPrice >= minPrice && fixedPrice <= maxPrice;

  /* -------------------------
  * 鍗曚欢璁＄畻
  * ------------------------- */
  const perItemPrice = fixedPrice;

  // 瀹為檯淇濊瘉閲戯紙涓婃灦鏃舵敹鍙栵級
  // 瑙勫垯涓嶅彉锛歮ax(鏈€浣庝繚璇侀噾, 褰撳墠鍑哄敭浠锋牸 * 3%)
  const perItemDeposit = Math.max(
    toNumber(item.minDeposit),
    Math.round(perItemPrice * 0.03)
  );

  // 鎵嬬画璐规í杞翠笓鐢ㄥ熀鏁?
  // 鏂拌鍒欙細max(鏈€浣庡嚭鍞环鏍?* 3%, 鏈€浣庝繚璇侀噾)
  const feeAxisDepositBase = Math.max(
    Math.round(minPrice * 0.03),
    toNumber(item.minDeposit)
  );

  // 鎵嬬画璐规í杞?= round(鍑哄敭浠锋牸 / max(鏈€浣庡嚭鍞环鏍?3%锛屾渶浣庝繚璇侀噾), 1)
  const feeAxis = Number((perItemPrice / feeAxisDepositBase).toFixed(1));

  // 鎵嬬画璐瑰簭鍙?
  const feeIndex = Math.max(1, Math.floor(feeAxis / 10));

  // 鍗曚欢鎵嬬画璐圭巼
  const feeRate = getFeeRateByIndex(feeIndex);

  // 鍗曚欢鎵嬬画璐?
  const perItemFee = Math.round(perItemPrice * feeRate);

  // 鍗曚欢棰勬湡鏀跺叆
  const perItemExpectedReceive = perItemPrice - perItemDeposit - perItemFee;

  /* -------------------------
   * 鍚堣灞曠ず
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

    // 鍗曚欢鏁版嵁
    perItemPrice,
    perItemDeposit,
    perItemFee,
    perItemExpectedReceive,

    // 鎵嬬画璐瑰垽瀹氳繃绋?
    feeAxis,
    feeIndex,
    feeRate,

    // 鍚堣鏁版嵁锛堢晫闈㈢敤锛?
    totalPrice,
    deposit: totalDeposit,
    fee: totalFee,
    expectedReceive
  };
}
/**
 * 鐢熸垚鍙樺寲鏇茬嚎鏁版嵁
 * 妯酱锛氫环鏍煎尯闂达紙鏈€浣庝环 -> 鏈€楂樹环锛?
 * 绾佃酱锛氬湪褰撳墠鏁伴噺涓嬬殑
 * - 棰勬湡鏀跺叆
 * - 淇濊瘉閲?
 * - 鎵嬬画璐?
 */
function buildTrendData(item, quantity = 1) {
  const minPrice = getMinListPrice(item);
  const maxPrice = getMaxListPrice(item);

  const points = [];

  // 浠庢渶浣庝环寮€濮?
  let currentPrice = minPrice;

  // 闃叉寮傚父姝诲惊鐜?
  let guard = 0;
  const maxGuard = 10000;

  while (currentPrice <= maxPrice && guard < maxGuard) {
    const info = calculateListingInfo(item, currentPrice, quantity);
    const totalPrice = info.totalPrice || 1;

    points.push({
      price: info.currentPrice,
      feeAxis: Number(info.feeAxis.toFixed(1)),

      // 绾佃酱鐢ㄦ瘮渚嬶紙0~1锛?
      incomeRate: info.expectedReceive / totalPrice,
      feeRateLine: info.fee / totalPrice,
      depositRate: info.deposit / totalPrice
    });

    // 涓嬩竴涓环鏍?= 涓婁竴涓环鏍?* 1.01
    let nextPrice = Math.round(currentPrice * 1.01);

    // 闃叉鍥涜垗浜斿叆鍚庝环鏍间笉鍙橈紝瀵艰嚧姝诲惊鐜?
    if (nextPrice <= currentPrice) {
      nextPrice = currentPrice + 1;
    }

    // 濡傛灉宸茬粡蹇秴杩囨渶澶т环锛屽氨鏈€鍚庤ˉ涓€涓渶澶т环鐐?
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

  // 濡傛灉鏈€鍚庝竴涓偣涓嶆槸鏈€楂樹环锛岃ˉ涓€涓渶楂樹环鐐?
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
 * 缁樺埗鍙樺寲鏇茬嚎寮圭獥閲岀殑 canvas
 * 涓夋潯绾匡細
 * - 棰勬湡鏀跺叆
 * - 鎵嬬画璐?
 * - 淇濊瘉閲?
 */
function renderTrendModalChart(info) {
  const canvas = $("trendChartCanvas");
  if (!canvas) return;

  const wrap = canvas.parentElement;
  const ctx = canvas.getContext("2d");
  if (!ctx || !wrap) return;

  // 杩欓噷涓嶅啀鎶芥牱锛岀洿鎺ユ嬁鍏ㄩ儴鐪熷疄鐐?
  const points = buildTrendData(info.item, info.quantity);
  if (!points.length) return;

  // 姣忎釜鐐瑰崰鐨勬í鍚戝搴?
  // 鎯崇湅寰楁洿寮€鍙互璋冨ぇ锛屾瘮濡?24 / 26
  const pointSpacing = 20;

  const dpr = window.devicePixelRatio || 1;
  const baseHeight = wrap.clientHeight || 560;

  const padding = {
    top: 24,
    right: 30,
    bottom: 90,
    left: 80
  };

  // 鍏抽敭锛氱敾甯冨搴﹁窡鐐规暟璧帮紝纭繚 464 涓偣閮借兘灞曞紑
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

  // 妯潗鏍囨寜鈥滅偣搴忓垪鈥濇帓锛屾瘡涓偣閮藉崰涓€涓綅缃?
  function getX(index) {
    return padding.left + index * pointSpacing;
  }

  // 绾靛潗鏍囧浐瀹?0~100%
  function getY(value) {
    const ratio = value / 1;
    return padding.top + plotHeight - ratio * plotHeight;
  }

  // =========================
  // 鑳屾櫙妯嚎锛?~100%锛?
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

  // Y杞寸櫨鍒嗘瘮鏂囧瓧
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
  // 姣忎釜鐐归兘鐢荤珫鍚戝埢搴︾嚎
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
  // 妯酱鏍囩锛氭瘡涓偣閮芥樉绀烘墜缁垂妯酱
  // 涓轰簡閬垮厤閲嶅彔锛屾枃瀛楁棆杞樉绀?
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

  drawLine("incomeRate", "#d8c36a");   // 棰勬湡鏀跺叆
  drawLine("feeRateLine", "#59b7ff");  // 鎵嬬画璐?
  drawLine("depositRate", "#8f9aa6");  // 淇濊瘉閲?

  // =========================
  // 楂樹寒褰撳墠浠锋牸瀵瑰簲鐐?
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
 * 鎵撳紑鍙樺寲鏇茬嚎寮圭獥
 */
function openTrendModal() {
  const info = getDraftInfo();
  if (!info) return;

  const mask = $("trendModalMask");
  const title = $("trendModalItemTitle");

  if (title) {
    title.textContent = `${info.item.name} / 鏁伴噺 ${info.quantity} / 褰撳墠鎵嬬画璐规í杞?${info.feeAxis.toFixed(1)}`;
  }

  if (mask) {
    mask.classList.add("show");
  }

  renderTrendModalChart(info);
}

/**
 * 鍏抽棴鍙樺寲鏇茬嚎寮圭獥
 */
function closeTrendModal() {
  const mask = $("trendModalMask");
  if (mask) {
    mask.classList.remove("show");
  }
}
/* =========================================================
 * 涔濄€侀《閮ㄩ噾甯佹樉绀?/ 鏁版嵁鐘舵€佹樉绀?
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


/* =========================================================
 * 鍗併€佷氦鏄撹褰?
 * ========================================================= */

function addRecord(type, itemName, price, count, extra = {}) {
  state.records.unshift(createRecordEntry(type, itemName, price, count, extra));
  saveState();
}

/* =========================================================
 * 鍗佷竴銆佽鍙栭潤鎬佹暟鎹?
 * 浠?items-data.js 閲岃锛?
 * - window.ITEMS_DATA
 * - window.SERVICE_CHARGE_DATA
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
      `宸茶鍙栭潤鎬佹暟鎹細鐗╁搧 ${state.items.length} 鏉★紝鎵嬬画璐硅鍒?${state.serviceChargeRules.length} 鏉
    );
  } else {
    updateDataStatus("鏈鍙栧埌闈欐€佹暟鎹紝璇峰厛鎵ц build-static-data.js");
  }

  renderFilters();
  renderAll();
}


/* =========================================================
 * 鍗佷簩銆侀€氱敤寮圭獥
 * ========================================================= */

function openModal({
  title = "鎻愮ず",
  content = "",
  confirmText = "纭畾",
  cancelText = "鍙栨秷",
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
    confirmText: "纭畾",
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
    confirmText: "纭",
    cancelText: "鍙栨秷",
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
  $("itemDetailDescription").textContent = item.description || "鏆傛棤鎻忚堪";

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
 * 鍗佷笁銆佸熀纭€鍒楄〃鑾峰彇
 * ========================================================= */

/**
 * 鎸夊搧璐ㄦ帓搴忥紝鍐嶆寜 seq锛屽啀鎸夊悕绉?
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
 * 浠撳簱鎵€鏈夌墿鍝侊紙涓嶈繃婊わ級
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
 * 璐拱椤佃繃婊ゅ悗鐨勭墿鍝?
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
 * 浜ゆ槗琛屽嚭鍞〉鍙充晶锛氫粨搴撲腑鍙笂鏋剁殑鐗╁搧
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
 * 鍗佸洓銆佸乏渚х瓫閫夋覆鏌?
 * ========================================================= */

