/* 後端網址與設定放在 config.js，不要寫死在程式碼裡 */
const API_URL = (globalThis.DONREN_CONFIG?.apiUrl || '').trim();
const TOKEN_KEY = 'donren-session-token-v1';
const ACCOUNT_KEY = 'donren-last-account-v1';

let db = {
  reports: [],
  source: [],
  sourceName: '',
  works: [],
  users: [],
};
const DEFAULT_WORKS = [
  { key: '磁磚-地磚', name: '地磚', active: true, sortOrder: 1, builtIn: true, manualMaterials: [], excelMaterials: [], materials: [] },
  { key: '磁磚-壁磚', name: '壁磚', active: true, sortOrder: 2, builtIn: true, manualMaterials: [], excelMaterials: [], materials: [] },
  { key: '防水工程', name: '防水', active: true, sortOrder: 3, builtIn: true, manualMaterials: [], excelMaterials: [], materials: [] },
  { key: '隔音地板', name: '隔音地墊', active: true, sortOrder: 4, builtIn: true, manualMaterials: [], excelMaterials: [], materials: [] },
];
let authUser = null;
let sessionToken = localStorage.getItem(TOKEN_KEY) || '';
let backendCapabilities = {};
let pickedSpotIds = new Set();
let draftMaterials = {};
let pendingReport = null;

const S = (room, suffix, label, code, x, y, diagramLabel = label) => ({
  id: `${room}-${suffix}`, room, label, diagramLabel, code, x, y,
  w: Math.max(2, 1.25 + diagramLabel.length * 0.38), h: 2.2,
  correctedLabel: room === 'A31',
});
const SPACE_HOTSPOTS = [
  S('A01', 'Y1', '陽台一', 'Y', 68.30, 7.10, '陽台'), S('A01', 'Y2', '陽台二', 'Y', 64.50, 10.80, '陽台'), S('A01', 'B', '廁所', 'B', 64.00, 15.30),
  S('A02', 'Y', '陽台', 'Y', 70.80, 7.90), S('A02', 'K', '廚房', 'K', 73.30, 7.90), S('A02', 'I1', '臥室一', 'I', 71.29, 12.45), S('A02', 'I2', '臥室二', 'I', 78.16, 10.84), S('A02', 'I3', '客廳', 'I', 74.80, 12.45), S('A02', 'B', '廁所', 'B', 78.70, 15.20),
  S('A03', 'Y', '陽台', 'Y', 82.60, 5.40), S('A03', 'I', '臥室', 'I', 82.01, 10.84), S('A03', 'B', '廁所', 'B', 81.40, 15.20),
  S('A04', 'I1', '主臥室', 'I', 85.86, 10.84), S('A04', 'I2', '臥室一', 'I', 89.14, 10.84), S('A04', 'I3', '客廳', 'I', 92.25, 10.84), S('A04', 'I4', '臥室二', 'I', 95.52, 9.15), S('A04', 'B1', '廁所一', 'B', 85.20, 15.30, '廁所'), S('A04', 'B2', '廁所二', 'B', 95.60, 12.70, '廁所'), S('A04', 'K', '廚房', 'K', 95.60, 15.60), S('A04', 'Y', '陽台', 'Y', 98.30, 14.10),
  S('A05', 'K', '廚房', 'K', 95.50, 21.80), S('A05', 'Y', '陽台', 'Y', 98.30, 24.70), S('A05', 'B1', '廁所一', 'B', 85.20, 23.00, '廁所'), S('A05', 'B2', '廁所二', 'B', 95.60, 25.20, '廁所'), S('A05', 'I1', '主臥室', 'I', 85.69, 26.96), S('A05', 'I2', '臥室一', 'I', 89.20, 26.96), S('A05', 'I3', '客廳', 'I', 92.39, 25.23), S('A05', 'I4', '臥室二', 'I', 95.52, 27.81),
  S('A06', 'B', '廁所', 'B', 81.10, 22.90), S('A06', 'I', '臥室', 'I', 82.21, 26.96), S('A06', 'Y', '陽台', 'Y', 82.20, 31.60),
  S('A07', 'B', '廁所', 'B', 78.10, 22.90), S('A07', 'I', '臥室', 'I', 77.31, 26.96), S('A07', 'Y', '陽台', 'Y', 76.60, 31.60),
  S('A08', 'B', '廁所', 'B', 63.00, 34.30), S('A08', 'I', '臥室', 'I', 66.79, 34.91), S('A08', 'Y', '陽台', 'Y', 70.70, 36.10),
  S('A09', 'B', '廁所', 'B', 63.00, 41.70), S('A09', 'I', '臥室', 'I', 66.79, 41.56), S('A09', 'Y', '陽台', 'Y', 70.70, 40.40),
  S('A10', 'B', '廁所', 'B', 63.00, 47.20), S('A10', 'I', '臥室', 'I', 66.79, 48.00), S('A10', 'Y', '陽台', 'Y', 70.70, 48.10),
  S('A11', 'B', '廁所', 'B', 63.00, 54.40), S('A11', 'I', '臥室', 'I', 66.79, 53.85), S('A11', 'Y', '陽台', 'Y', 70.70, 53.20),
  S('A12', 'B', '廁所', 'B', 63.90, 58.40), S('A12', 'I1', '臥室二', 'I', 66.79, 59.05), S('A12', 'I2', '客廳', 'I', 64.97, 63.40), S('A12', 'K', '廚房', 'K', 68.20, 65.90), S('A12', 'I3', '臥室一', 'I', 64.97, 68.40), S('A12', 'Y', '陽台', 'Y', 68.20, 69.20),
  S('A13', 'B', '廁所', 'B', 63.10, 78.20), S('A13', 'I', '臥室', 'I', 66.79, 77.71), S('A13', 'Y', '陽台', 'Y', 70.70, 76.30),
  S('A14', 'I1', '臥室', 'I', 66.79, 82.83), S('A14', 'I2', '客廳', 'I', 66.79, 86.94), S('A14', 'B', '廁所', 'B', 63.10, 91.40), S('A14', 'K', '廚房', 'K', 65.10, 91.40), S('A14', 'I3', '臥室一', 'I', 68.13, 91.50), S('A14', 'Y', '陽台', 'Y', 65.10, 95.20),
  S('A15', 'B1', '廁所一', 'B', 58.20, 78.10, '廁所'), S('A15', 'I1', '主臥室', 'I', 54.36, 78.88), S('A15', 'I2', '臥室二', 'I', 54.36, 82.79), S('A15', 'I3', '客廳', 'I', 56.58, 86.82), S('A15', 'I4', '臥室一', 'I', 53.22, 91.50), S('A15', 'B2', '廁所二', 'B', 56.20, 91.40, '廁所'), S('A15', 'K', '廚房', 'K', 58.20, 91.40), S('A15', 'Y', '陽台', 'Y', 57.20, 95.20),
  S('A16', 'Y', '陽台', 'Y', 50.60, 74.60), S('A16', 'I', '臥室', 'I', 54.36, 74.04), S('A16', 'B', '廁所', 'B', 58.20, 73.20),
  S('A17', 'I1', '臥室二', 'I', 54.36, 59.05), S('A17', 'B', '廁所', 'B', 58.20, 58.40), S('A17', 'I2', '客廳', 'I', 56.47, 63.72), S('A17', 'K', '廚房', 'K', 53.20, 66.00), S('A17', 'Y', '陽台', 'Y', 53.20, 69.00), S('A17', 'I3', '臥室一', 'I', 56.61, 68.56),
  S('A18', 'Y', '陽台', 'Y', 50.60, 53.10), S('A18', 'I', '臥室', 'I', 54.36, 54.25), S('A18', 'B', '廁所', 'B', 58.20, 54.40),
  S('A19', 'Y', '陽台', 'Y', 50.60, 48.80), S('A19', 'I', '臥室', 'I', 54.36, 47.92), S('A19', 'B', '廁所', 'B', 58.20, 47.80),
  S('A20', 'Y', '陽台', 'Y', 53.20, 32.60), S('A20', 'I1', '臥室二', 'I', 56.87, 33.49), S('A20', 'K', '廚房', 'K', 53.30, 35.80), S('A20', 'I2', '客廳', 'I', 56.36, 38.29), S('A20', 'I3', '臥室一', 'I', 54.36, 42.85), S('A20', 'B', '廁所', 'B', 58.20, 43.50),
  S('A21', 'B', '廁所', 'B', 48.10, 21.80), S('A21', 'I', '臥室', 'I', 48.35, 26.48), S('A21', 'Y', '陽台', 'Y', 47.20, 31.80),
  S('A22', 'B', '廁所', 'B', 42.70, 21.80), S('A22', 'I', '臥室', 'I', 43.30, 26.48), S('A22', 'Y', '陽台', 'Y', 44.00, 31.80),
  S('A23', 'B', '廁所', 'B', 31.70, 22.70), S('A23', 'I1', '客廳', 'I', 35.83, 24.39), S('A23', 'I2', '臥室一', 'I', 39.42, 24.18), S('A23', 'I3', '臥室二', 'I', 32.30, 27.25), S('A23', 'K', '廚房', 'K', 37.70, 28.30), S('A23', 'Y', '陽台', 'Y', 40.00, 28.70),
  S('A24', 'B', '廁所', 'B', 17.80, 21.80), S('A24', 'I', '臥室', 'I', 18.13, 26.48), S('A24', 'Y', '陽台', 'Y', 17.70, 31.80),
  S('A25', 'K', '廚房', 'K', 4.30, 21.60), S('A25', 'B1', '廁所一', 'B', 4.30, 25.00, '廁所'), S('A25', 'Y', '陽台', 'Y', 1.70, 25.30), S('A25', 'B2', '廁所二', 'B', 14.70, 22.80, '廁所'), S('A25', 'I1', '客廳', 'I', 7.87, 25.11), S('A25', 'I2', '臥室', 'I', 11.26, 26.96), S('A25', 'I3', '主臥室', 'I', 14.22, 26.96), S('A25', 'I4', '臥室一', 'I', 4.30, 28.50),
  S('A26', 'I1', '臥室二', 'I', 4.30, 8.59), S('A26', 'I2', '臥室一', 'I', 11.03, 10.60), S('A26', 'I3', '主臥室', 'I', 14.17, 10.60), S('A26', 'I4', '客廳', 'I', 8.07, 12.98), S('A26', 'Y', '陽台', 'Y', 1.70, 13.80), S('A26', 'B1', '廁所一', 'B', 4.30, 12.50, '廁所'), S('A26', 'K', '廚房', 'K', 4.30, 15.50), S('A26', 'B2', '廁所二', 'B', 14.80, 15.00, '廁所'),
  S('A27', 'Y', '陽台', 'Y', 17.20, 5.40), S('A27', 'I', '臥室', 'I', 17.79, 10.60), S('A27', 'B', '廁所', 'B', 18.50, 14.90),
  S('A28', 'Y', '陽台', 'Y', 21.30, 8.50), S('A28', 'K', '廚房', 'K', 23.70, 8.50), S('A28', 'I1', '臥室一', 'I', 21.78, 12.98), S('A28', 'I2', '客廳', 'I', 25.06, 12.98), S('A28', 'I3', '臥室二', 'I', 28.99, 10.60), S('A28', 'B', '廁所', 'B', 29.30, 15.00),
  S('A29', 'I1', '臥室二', 'I', 31.90, 10.60), S('A29', 'B', '廁所', 'B', 31.40, 14.90), S('A29', 'K', '廚房', 'K', 36.90, 8.60), S('A29', 'Y', '陽台', 'Y', 39.20, 8.60), S('A29', 'I2', '客廳', 'I', 35.55, 12.98), S('A29', 'I3', '臥室一', 'I', 38.88, 12.98),
  S('A30', 'I1', '臥室二', 'I', 42.13, 10.60), S('A30', 'B', '廁所', 'B', 41.40, 14.90), S('A30', 'K', '廚房', 'K', 47.00, 8.60), S('A30', 'Y', '陽台', 'Y', 49.30, 8.60), S('A30', 'I2', '客廳', 'I', 45.47, 12.98), S('A30', 'I3', '臥室一', 'I', 48.97, 12.98),
  S('A31', 'Y1', '陽台', 'Y', 53.10, 7.20), S('A31', 'I', '臥室', 'I', 53.80, 10.80), S('A31', 'B', '廁所', 'B', 53.20, 15.40),
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function clean(value) {
  return String(value ?? '').trim();
}

function n(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value, digits = 3) {
  return n(value).toLocaleString('zh-TW', { maximumFractionDigits: digits });
}

function today() {
  return new Date().toLocaleDateString('sv-SE');
}

function toast(message, error = false) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.className = `toast${error ? ' error' : ''}`;
  window.setTimeout(() => element.classList.add('hidden'), 2800);
}

function workLabel(work) {
  const configured = db.works.find((item) => item.key === work);
  if (configured) return configured.name;
  return ({
    '磁磚-地磚': '地磚',
    '磁磚-壁磚': '壁磚',
    防水工程: '防水',
    隔音地板: '隔音地墊',
  })[work] || work;
}

function exportWorkLabel(work) {
  return ({
    '磁磚-地磚': '地磚',
    '磁磚-壁磚': '壁磚',
    防水工程: '防水',
    隔音地板: '隔音地板',
  })[work] || work;
}

function normalizeMaterial(item) {
  const name = clean(item?.name);
  if (!name) return null;
  return {
    name,
    category: clean(item.category) || '一般材料',
    unit: clean(item.unit),
  };
}

function materialIdentity(item) {
  const material = normalizeMaterial(item);
  return material ? `${material.category}|${material.name}|${material.unit}` : '';
}

function uniqueMaterials(materials) {
  const found = new Map();
  (materials || []).forEach((item) => {
    const material = normalizeMaterial(item);
    if (!material) return;
    const key = materialIdentity(material).toLowerCase();
    if (!found.has(key)) found.set(key, material);
  });
  return [...found.values()];
}

function normalizeWorkItem(work) {
  const manualMaterials = uniqueMaterials(work?.manualMaterials || []);
  const excelMaterials = uniqueMaterials(work?.excelMaterials || []);
  return {
    ...work,
    manualMaterials,
    excelMaterials,
    materials: uniqueMaterials(work?.materials?.length ? work.materials : [...manualMaterials, ...excelMaterials]),
  };
}

function workIdentity(value) {
  return normalizeExcelWork(clean(value))
    .replace(/[‐‑‒–—－_]/g, '-')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function workAliases(workOrKey) {
  const supplied = typeof workOrKey === 'object' ? workOrKey : null;
  const text = supplied ? clean(supplied.key || supplied.name) : clean(workOrKey);
  const work = supplied || db.works.find((item) => item.key === text || item.name === text)
    || { key: text, name: text };
  return new Set([workIdentity(work.key), workIdentity(work.name)].filter(Boolean));
}

function sourceWorkMaterials(workOrKey, rows = db.source) {
  const aliases = workAliases(workOrKey);
  const materials = [];
  (rows || []).forEach((row) => Object.entries(row.materials || {}).forEach(([sourceWork, list]) => {
    if (aliases.has(workIdentity(sourceWork)) && Array.isArray(list)) materials.push(...list);
  }));
  return uniqueMaterials(materials);
}

function effectiveExcelMaterials(work) {
  return uniqueMaterials([...(work?.excelMaterials || []), ...sourceWorkMaterials(work)]);
}

function effectiveWorkMaterials(work) {
  return uniqueMaterials([...(work?.materials || []), ...(work?.manualMaterials || []), ...effectiveExcelMaterials(work)]);
}

/**
 * 舊版後端可能已保存 source，卻尚未把後來辨識到的工項建立到 works。
 * 前端先以 source 補齊顯示；新版後端的登入修復會同步把它正式寫回 Google Sheet。
 */
function worksWithSource(configuredWorks, rows) {
  const works = (configuredWorks || []).map(normalizeWorkItem);
  const identities = new Set();
  works.forEach((work) => workAliases(work).forEach((alias) => identities.add(alias)));
  const recovered = new Map();
  (rows || []).forEach((row) => Object.entries(row.materials || {}).forEach(([key, materials]) => {
    if (!Array.isArray(materials) || !materials.length) return;
    const normalizedKey = normalizeExcelWork(key);
    const identity = workIdentity(normalizedKey);
    const current = recovered.get(identity) || { key: normalizedKey, materials: [] };
    current.materials.push(...materials);
    recovered.set(identity, current);
  }));
  recovered.forEach(({ key: normalizedKey, materials }, identity) => {
    if (identities.has(identity)) return;
    const work = normalizeWorkItem({
      key: normalizedKey,
      name: excelWorkName(normalizedKey, normalizedKey),
      active: true,
      sortOrder: works.length + 1,
      builtIn: false,
      manualMaterials: [],
      excelMaterials: uniqueMaterials(materials),
      materials: uniqueMaterials(materials),
      recoveredFromSource: true,
    });
    works.push(work);
    workAliases(work).forEach((alias) => identities.add(alias));
  });
  return works;
}

function spaceCode(value) {
  const text = clean(typeof value === 'object' ? value.code || value.label : value);
  if (['B', 'K', 'I', 'Y', '廊', '廳'].includes(text)) return text;
  if (/廁所/.test(text)) return 'B';
  if (/廚房/.test(text)) return 'K';
  if (/陽台|陽臺/.test(text)) return 'Y';
  if (/室內|臥室|主臥|客廳/.test(text)) return 'I';
  if (/走廊/.test(text)) return '廊';
  return text;
}

function normalizedSpaces(item) {
  return (item.spaces || []).map((space) => (typeof space === 'string'
    ? { label: space, code: spaceCode(space) }
    : { label: space.label || space.code, code: spaceCode(space) }));
}

/**
 * 呼叫 Google Apps Script 後端。
 * 一律用 POST + text/plain：text/plain 屬 CORS 安全清單，
 * 不會觸發 Apps Script 無法回應的 preflight（OPTIONS）請求。
 * 因為不能帶自訂標頭，登入權杖改放在 body。
 */
async function api(action, payload = {}) {
  if (!API_URL) {
    throw new Error('尚未設定後端網址，請先編輯 config.js 貼上 Apps Script 網址');
  }
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: sessionToken, payload }),
      redirect: 'follow',
    });
  } catch (cause) {
    throw new Error('無法連線到後端，請確認網路狀態與 config.js 的網址', { cause });
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`後端回應格式錯誤（HTTP ${response.status}），請確認部署權限為「任何人」`);
  }
  if (!result.ok) {
    const error = new Error(result.error?.message || '後端錯誤');
    error.code = result.error?.code || 'server_error';
    if (error.code === 'unauthorized' || error.code === 'disabled') {
      clearSession();
      showLogin(error.message);
    }
    throw error;
  }
  return result.data || {};
}

function setConnection(ok, text) {
  const element = document.getElementById('connectionStatus');
  element.textContent = text || (ok ? '集中資料庫連線正常' : '伺服器未連線');
  element.style.borderColor = ok ? '#2d8063' : '#7b3038';
  element.style.background = ok ? '#0d291f' : '#2b1115';
  element.style.color = ok ? '#82dfbd' : '#ff9ca4';
}

async function syncState() {
  const state = await api('state');
  authUser = state.currentUser || null;
  const source = Array.isArray(state.source) ? state.source : [];
  const configuredWorks = Array.isArray(state.works) && state.works.length
    ? state.works
    : DEFAULT_WORKS;
  db = {
    reports: Array.isArray(state.reports) ? state.reports : [],
    source,
    sourceName: state.sourceName || '',
    works: worksWithSource(configuredWorks, source),
    users: Array.isArray(state.users) ? state.users : [],
  };
  backendCapabilities = state.capabilities || {};
  setConnection(true, authUser ? `已連線｜${authUser.name}` : '已連線');
}

function currentUser() {
  return authUser;
}

function isLoggedIn() {
  return Boolean(sessionToken && authUser);
}

function isAdmin() {
  return Boolean(authUser && authUser.role === 'admin');
}

function clearSession() {
  sessionToken = '';
  authUser = null;
  localStorage.removeItem(TOKEN_KEY);
  db.reports = [];
  db.works = DEFAULT_WORKS.map(normalizeWorkItem);
  db.users = [];
  backendCapabilities = {};
}

function showLogin(message) {
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('loginModal').classList.remove('hidden');
  const hint = document.getElementById('loginHint');
  hint.textContent = message || '';
  hint.classList.toggle('hidden', !message);
  const account = document.getElementById('loginAccount');
  const password = document.getElementById('loginPassword');
  account.value = localStorage.getItem(ACCOUNT_KEY) || '';
  password.value = '';
  (account.value ? password : account).focus();
}

/** 登入成功後把整個畫面重新畫一次。 */
async function enterApp() {
  // 先問後端我是誰、套好權限，最後才把畫面放出來。
  // 否則在等待後端回應的這 1–3 秒，後台按鈕會先閃出來給非管理員看到。
  await syncState();
  applyAccess();
  setMode('front');
  initFloor();
  initWorkOptions();
  renderSelection();
  calculate();
  renderReports();
  renderSource();
  renderWorkItems();
  renderAccounts();
  await loadPlanRegions();
  renderHotspots();
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  // 畫面顯示後才量得到可視寬度，縮放要放在最後
  initPlanZoom();
}

async function doLogin() {
  const account = clean(document.getElementById('loginAccount').value);
  const password = document.getElementById('loginPassword').value;
  if (!account || !password) return showLogin('請輸入帳號與密碼');
  const button = document.getElementById('loginBtn');
  button.disabled = true;
  button.textContent = '登入中…';
  try {
    const result = await api('login', { account, password });
    sessionToken = result.token;
    authUser = result.user;
    localStorage.setItem(TOKEN_KEY, sessionToken);
    localStorage.setItem(ACCOUNT_KEY, authUser.account);
    await enterApp();
    toast(`${authUser.name} 已登入`);
  } catch (error) {
    sessionToken = '';
    authUser = null;
    localStorage.removeItem(TOKEN_KEY);
    showLogin(error.message);
  } finally {
    button.disabled = false;
    button.textContent = '登入';
  }
}

async function doLogout() {
  if (!window.confirm('確定要登出？')) return;
  try {
    await api('logout');
  } catch (error) {
    // 後端連不上也照樣清掉本機登入狀態
  }
  clearSession();
  showLogin('已登出');
}

function openChangePassword() {
  document.getElementById('passwordModal').classList.remove('hidden');
  document.getElementById('oldPassword').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword2').value = '';
  document.getElementById('oldPassword').focus();
}

function closeChangePassword() {
  document.getElementById('passwordModal').classList.add('hidden');
}

async function submitChangePassword() {
  const oldPassword = document.getElementById('oldPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const repeated = document.getElementById('newPassword2').value;
  if (newPassword.length < 6) return toast('新密碼至少 6 碼', true);
  if (newPassword !== repeated) return toast('兩次輸入的新密碼不一致', true);
  try {
    await api('changePassword', { oldPassword, newPassword });
    closeChangePassword();
    toast('密碼已更新');
  } catch (error) {
    toast(error.message, true);
  }
}

function applyAccess() {
  const admin = isAdmin();
  document.getElementById('accountBtn').textContent = authUser
    ? `${authUser.name}（${authUser.account}）｜${admin ? '後台管理' : '前端填報'}`
    : '未登入';
  document.getElementById('reporterIdentity').textContent = authUser
    ? `${authUser.name}　帳號 ${authUser.account}`
    : '未登入';
  document.getElementById('backBtn').classList.toggle('hidden', !admin);
  // 只有一種模式可用時，整條切換列都不出現
  document.querySelector('.mode-switch').classList.toggle('hidden', !admin);
  const accountTab = document.getElementById('accountTabBtn');
  if (accountTab) accountTab.classList.toggle('hidden', !admin);
  const workTab = document.getElementById('workTabBtn');
  if (workTab) workTab.classList.toggle('hidden', !admin);
  const reporter = document.getElementById('reporterName');
  if (reporter && authUser) {
    // 填表人一律等於登入帳號，避免冒名填報
    reporter.value = authUser.name;
    reporter.readOnly = true;
  }
  if (!admin) {
    document.getElementById('front').classList.remove('hidden');
    document.getElementById('back').classList.remove('active');
    document.getElementById('frontBtn').classList.add('active');
    document.getElementById('backBtn').classList.remove('active');
  }
}

function setMode(mode) {
  if (mode === 'back' && !isAdmin()) return toast('此權限僅能使用前端填報', true);
  document.getElementById('front').classList.toggle('hidden', mode !== 'front');
  document.getElementById('back').classList.toggle('active', mode === 'back');
  document.getElementById('frontBtn').classList.toggle('active', mode === 'front');
  document.getElementById('backBtn').classList.toggle('active', mode === 'back');
  if (mode === 'back') {
    renderReports();
    renderSource();
    renderWorkItems();
    renderAccounts();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backTab(id) {
  if (id === 'accounts' && !isAdmin()) return;
  document.querySelectorAll('.back-tab').forEach((element) => element.classList.toggle('active', element.dataset.tab === id));
  document.querySelectorAll('.back-view').forEach((element) => element.classList.toggle('active', element.id === id));
}

/** 剛建立或剛重設的帳密，只留在記憶體供「複製帳密」使用。 */
let lastIssued = null;

async function addAccount() {
  if (!isAdmin()) return toast('只有後台管理帳號可以建立帳號', true);
  const name = clean(document.getElementById('accountName').value);
  const account = clean(document.getElementById('accountId').value);
  const password = document.getElementById('accountPassword').value;
  const role = document.getElementById('accountRole').value;
  if (!name) return toast('請輸入使用者姓名', true);
  if (!/^[A-Za-z0-9._-]{3,20}$/.test(account)) return toast('帳號須為 3–20 碼英數字，可含 . _ -', true);
  if (password.length < 6) return toast('密碼至少 6 碼', true);
  try {
    const result = await api('addUser', { name, account, password, role });
    await syncState();
    document.getElementById('accountName').value = '';
    document.getElementById('accountId').value = '';
    document.getElementById('accountPassword').value = '';
    lastIssued = { account: result.user.account, password };
    const issued = document.getElementById('issuedAccount');
    issued.classList.remove('hidden');
    issued.innerHTML = `已建立 <b>${esc(result.user.name)}</b>　帳號 <span class="code">${esc(result.user.account)}</span>　密碼 <span class="code">${esc(password)}</span>
      <button class="btn" onclick="copyLogin()">複製帳密</button>
      <br><small>密碼只在這裡顯示這一次，後端只保存雜湊值，請立即交給本人。</small>`;
    renderAccounts();
    toast('帳號已建立');
  } catch (error) {
    toast(error.message, true);
  }
}

async function copyLogin() {
  if (!lastIssued) return;
  const text = `帳號：${lastIssued.account}　密碼：${lastIssued.password}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('已複製帳號密碼');
  } catch {
    toast(text);
  }
}

async function resetAccountPassword(account) {
  if (!isAdmin()) return toast('只有後台管理帳號可以重設密碼', true);
  const password = window.prompt(`為帳號 ${account} 設定新密碼（至少 6 碼）：`, '');
  if (password === null) return;
  if (password.length < 6) return toast('密碼至少 6 碼', true);
  try {
    await api('resetPassword', { account, password });
    lastIssued = { account, password };
    const issued = document.getElementById('issuedAccount');
    issued.classList.remove('hidden');
    issued.innerHTML = `已重設 <span class="code">${esc(account)}</span> 的密碼為 <span class="code">${esc(password)}</span>
      <button class="btn" onclick="copyLogin()">複製帳密</button>
      <br><small>該帳號原本的登入狀態已全部失效，需用新密碼重新登入。</small>`;
    toast('密碼已重設');
  } catch (error) {
    toast(error.message, true);
  }
}

async function toggleAccountActive(account, active) {
  if (!isAdmin()) return toast('只有後台管理帳號可以停用或啟用帳號', true);
  if (!window.confirm(`確定${active ? '啟用' : '停用'}帳號 ${account}？${active ? '' : '該帳號會立即被踢出登入。'}`)) return;
  try {
    await api('setUserActive', { account, active });
    await syncState();
    renderAccounts();
    toast(active ? '帳號已啟用' : '帳號已停用');
  } catch (error) {
    toast(error.message, true);
  }
}

async function updateAccountRole(account, checkbox) {
  if (!isAdmin()) {
    checkbox.checked = !checkbox.checked;
    return toast('只有後台管理帳號可以調整權限', true);
  }
  checkbox.disabled = true;
  try {
    const result = await api('setUserRole', { account, role: checkbox.checked ? 'admin' : 'front' });
    await syncState();
    renderAccounts();
    toast(`${result.user.name} 已調整為${result.user.role === 'admin' ? '後台管理＋前端填報' : '僅前端填報'}`);
  } catch (error) {
    await syncState().catch(() => {});
    renderAccounts();
    toast(error.message, true);
  }
}

function renderAccounts() {
  const root = document.getElementById('accountList');
  if (!root) return;
  if (!isAdmin()) {
    root.innerHTML = '';
    return;
  }
  root.innerHTML = db.users.map((user) => {
    const self = authUser && user.account === authUser.account;
    return `
    <div class="permission-row">
      <b>${esc(user.id)}</b>
      <div>
        <b>${esc(user.name)}</b>
        <span class="role-chip ${user.active ? 'role-enabled' : 'role-disabled'}">${user.active ? '使用中' : '已停用'}</span>
        ${self ? '<span class="badge">目前登入</span>' : ''}
        <br><span class="code">${esc(user.account)}</span>
      </div>
      <label class="permission-toggle">
        <input type="checkbox" ${user.role === 'admin' ? 'checked' : ''} ${self ? 'disabled' : ''}
          onchange="updateAccountRole('${esc(user.account)}',this)">
        <span>後台管理權限</span><small>不勾選＝只能前端填報</small>
      </label>
      <span class="code">${esc(user.lastLoginAt || '尚未登入')}</span>
      <div class="permission-actions">
        <button class="btn" onclick="resetAccountPassword('${esc(user.account)}')">重設密碼</button>
        ${user.active
          ? `<button class="btn danger" ${self ? 'disabled' : ''} onclick="toggleAccountActive('${esc(user.account)}',false)">停用</button>`
          : `<button class="btn primary" onclick="toggleAccountActive('${esc(user.account)}',true)">啟用</button>`}
      </div>
    </div>`;
  }).join('') || '<div class="empty">尚未建立任何帳號</div>';
}

function activeWorks() {
  return db.works.filter((work) => work.active).sort((a, b) => n(a.sortOrder) - n(b.sortOrder)
    || workLabel(a.key).localeCompare(workLabel(b.key), 'zh-TW'));
}

function initWorkOptions() {
  const element = document.getElementById('work');
  if (!element) return;
  const old = element.value;
  const works = activeWorks();
  element.innerHTML = works.length
    ? works.map((work) => `<option value="${esc(work.key)}">${esc(work.name)}</option>`).join('')
    : '<option value="">目前沒有可填報的工項</option>';
  element.disabled = !works.length;
  if (works.some((work) => work.key === old)) element.value = old;
  if (element.value !== old) draftMaterials = {};
}

function materialCatalog() {
  const materials = [];
  db.source.forEach((row) => Object.values(row.materials || {}).forEach((list) => {
    if (Array.isArray(list)) materials.push(...list);
  }));
  db.works.forEach((work) => materials.push(...(work.materials || [])));
  return uniqueMaterials(materials).sort((a, b) => a.category.localeCompare(b.category, 'zh-TW')
    || a.name.localeCompare(b.name, 'zh-TW'));
}

function renderMaterialChoices(rootId, selectedMaterials = []) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const selected = new Set(selectedMaterials.map((item) => materialIdentity(item).toLowerCase()));
  const catalog = materialCatalog();
  root.innerHTML = catalog.length ? catalog.map((material) => {
    const key = materialIdentity(material);
    return `<label class="material-choice">
      <input type="checkbox" data-material-key="${encodeURIComponent(key)}" ${selected.has(key.toLowerCase()) ? 'checked' : ''}>
      <span><b>${esc(material.name)}</b><small>${esc(material.category)}${material.unit ? `｜${esc(material.unit)}` : ''}</small></span>
    </label>`;
  }).join('') : '<span class="choice-empty">尚無材料清單；可在下方手動輸入，或先匯入數量明細 Excel。</span>';
}

function chosenMaterials(rootId) {
  const catalog = new Map(materialCatalog().map((item) => [materialIdentity(item).toLowerCase(), item]));
  return [...document.querySelectorAll(`#${rootId} input[data-material-key]:checked`)]
    .map((input) => catalog.get(decodeURIComponent(input.dataset.materialKey).toLowerCase()))
    .filter(Boolean);
}

function parseManualMaterials(text) {
  return uniqueMaterials(String(text || '').split(/\r?\n|[,，、]+/).map((line) => {
    const parts = line.split(/[|｜]/).map(clean);
    return { name: parts[0], unit: parts[1] || '', category: '後台設定' };
  }));
}

function materialBadges(materials) {
  return materials.length
    ? materials.map((material) => `<span class="material-chip">${esc(material.name)}${material.unit ? `／${esc(material.unit)}` : ''}</span>`).join('')
    : '<span class="work-storage">尚未連動材料</span>';
}

async function addWorkItem() {
  if (!isAdmin()) return toast('只有後台管理帳號可以新增工項', true);
  const input = document.getElementById('workName');
  const name = clean(input.value).replace(/\s+/g, ' ');
  if (!name) return toast('請輸入工項名稱', true);
  if (name.length > 40) return toast('工項名稱最多 40 個字', true);
  const materials = uniqueMaterials([
    ...chosenMaterials('newWorkMaterialChoices'),
    ...parseManualMaterials(document.getElementById('newWorkManualMaterials').value),
  ]);
  if (materials.length && backendCapabilities.workMaterials !== true) {
    return toast('後端仍是舊版，請先重新部署最新版 Code.gs，再新增工項與連動材料', true);
  }
  const button = document.getElementById('addWorkBtn');
  button.disabled = true;
  try {
    await api('addWork', { name, materials });
    input.value = '';
    document.getElementById('newWorkManualMaterials').value = '';
    await syncState();
    initWorkOptions();
    renderWorkItems();
    calculate();
    toast(`已新增工項：${name}`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

let editingWorkKey = '';

function openWorkMaterials(key) {
  const work = db.works.find((item) => item.key === key);
  if (!work) return toast('找不到此工項，請重新整理', true);
  editingWorkKey = key;
  const excelMaterials = effectiveExcelMaterials(work);
  const backendReady = backendCapabilities.workMaterials === true;
  document.getElementById('workMaterialTitle').textContent = `設定「${work.name}」連動材料`;
  document.getElementById('excelDetectedMaterials').innerHTML = excelMaterials.length
    ? materialBadges(excelMaterials)
    : '<span class="choice-empty">目前的 Excel 沒有自動辨識到材料</span>';
  document.getElementById('backendWorkWarning').classList.toggle('hidden', backendReady);
  document.getElementById('saveWorkMaterialsBtn').disabled = !backendReady;
  document.getElementById('workManualMaterials').value = '';
  renderMaterialChoices('workMaterialChoices', work.manualMaterials);
  document.getElementById('workMaterialModal').classList.remove('hidden');
}

function closeWorkMaterials() {
  editingWorkKey = '';
  document.getElementById('workMaterialModal').classList.add('hidden');
}

async function saveWorkMaterials() {
  const work = db.works.find((item) => item.key === editingWorkKey);
  if (!work) return toast('找不到此工項，請重新整理', true);
  if (backendCapabilities.workMaterials !== true) {
    return toast('後端仍是舊版，請重新部署最新版 Code.gs 後再儲存', true);
  }
  const materials = uniqueMaterials([
    ...chosenMaterials('workMaterialChoices'),
    ...parseManualMaterials(document.getElementById('workManualMaterials').value),
  ]);
  const button = document.getElementById('saveWorkMaterialsBtn');
  button.disabled = true;
  try {
    await api('setWorkMaterials', { key: work.key, materials });
    await syncState();
    renderWorkItems();
    calculate();
    closeWorkMaterials();
    toast(`已更新「${work.name}」的連動材料`);
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function toggleWorkActive(key, active) {
  if (!isAdmin()) return toast('只有後台管理帳號可以調整工項', true);
  const work = db.works.find((item) => item.key === key);
  if (!work) return toast('找不到此工項，請重新整理', true);
  const warning = active
    ? `確定恢復「${work.name}」供前端填報？`
    : `確定停用「${work.name}」？前端選單會立即隱藏，但歷史回報仍會保留。`;
  if (!window.confirm(warning)) return;
  try {
    await api('setWorkActive', { key, active });
    await syncState();
    initWorkOptions();
    renderWorkItems();
    calculate();
    toast(active ? `已恢復工項：${work.name}` : `已停用工項：${work.name}`);
  } catch (error) {
    toast(error.message, true);
  }
}

function renderWorkItems() {
  const root = document.getElementById('workList');
  if (!root) return;
  if (!isAdmin()) {
    root.innerHTML = '';
    return;
  }
  const works = [...db.works].sort((a, b) => n(a.sortOrder) - n(b.sortOrder)
    || workLabel(a.key).localeCompare(workLabel(b.key), 'zh-TW'));
  root.innerHTML = works.map((work) => {
    const excelMaterials = effectiveExcelMaterials(work);
    const materials = effectiveWorkMaterials(work);
    return `
    <div class="work-row">
      <div>
        <b>${esc(work.name)}</b>
        ${excelMaterials.length ? '<span class="badge">Excel 自動辨識</span>' : (work.builtIn ? '<span class="badge">系統原有</span>' : '<span class="badge">後台新增</span>')}
        <br><span class="work-storage">試算表儲存值：${esc(work.key)}</span>
        <div class="work-materials"><span>連動材料</span>${materialBadges(materials)}</div>
      </div>
      <span class="role-chip ${work.active ? 'role-enabled' : 'role-disabled'}">${work.active ? '前端可填報' : '已停用'}</span>
      <div class="work-actions">
        <button class="btn" onclick="openWorkMaterials(decodeURIComponent('${encodeURIComponent(work.key)}'))">設定材料</button>
        ${work.active
          ? `<button class="btn danger" onclick="toggleWorkActive(decodeURIComponent('${encodeURIComponent(work.key)}'),false)">停用</button>`
          : `<button class="btn primary" onclick="toggleWorkActive(decodeURIComponent('${encodeURIComponent(work.key)}'),true)">恢復</button>`}
      </div>
    </div>`;
  }).join('') || '<div class="empty">尚未建立任何工項</div>';
  renderMaterialChoices('newWorkMaterialChoices');
}

function floors() {
  const list = [...new Set(db.source.map((row) => row.floor))].sort((a, b) => n(a) - n(b));
  return list.length ? list : Array.from({ length: 13 }, (_, index) => String(index + 2));
}

function initFloor() {
  const element = document.getElementById('floor');
  const old = element.value;
  const all = floors();
  element.innerHTML = all.map((floor) => `<option value="${esc(floor)}">${esc(floor)}F</option>`).join('');
  if (all.includes(old)) element.value = old;
}

function selectedSpots() {
  return planSpots.filter((spot) => pickedSpotIds.has(spot.id));
}

/**
 * 靜態檔案位置容錯。
 * 正常結構是 assets/xxx；但用 GitHub 網頁拖曳上傳時資料夾常被攤平成根目錄，
 * 兩種都要能載入，否則平面圖與 Excel 匯出會直接壞掉。
 */
let assetPrefix = 'assets/';

/** 讀取靜態檔：先試 assets/，失敗改試根目錄。 */
async function fetchAsset(name) {
  const candidates = assetPrefix === 'assets/' ? [`assets/${name}`, name] : [name, `assets/${name}`];
  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        assetPrefix = url.startsWith('assets/') ? 'assets/' : '';
        return response;
      }
      lastError = new Error(`找不到 ${url}（HTTP ${response.status}）`);
    } catch (cause) {
      lastError = cause;
    }
  }
  throw lastError || new Error(`找不到 ${name}`);
}

function planImageFallback(image) {
  if (image.dataset.retried) return planImageFailed();
  image.dataset.retried = '1';
  assetPrefix = '';
  image.src = 'floor-plan-04.png?v=20260902-300ppi';
}

/**
 * 平面圖區域設定（由 region-editor.html 產生的 floor-plan-regions.json）。
 * 有這個檔就改用「整塊區域可點」，沒有就沿用內建的 145 個標號按鈕。
 */
let planRegions = null;
let planSpots = SPACE_HOTSPOTS;

const PLAN_SELECTION_GROUPS = {
  'interior-11': {
    label: '1-1區室內',
    rooms: ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A31'],
    codes: ['I', 'K', 'B'],
  },
  'interior-12': {
    label: '1-2區室內',
    rooms: ['A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19', 'A20'],
    codes: ['I', 'K', 'B'],
  },
  'interior-2': {
    label: '2區室內',
    rooms: ['A21', 'A22', 'A23', 'A24', 'A25', 'A26', 'A27', 'A28', 'A29', 'A30'],
    codes: ['I', 'K', 'B'],
  },
  'balcony-11': {
    label: '1-1區陽臺',
    rooms: ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A31'],
    codes: ['Y'],
  },
  'balcony-12': {
    label: '1-2區陽臺',
    rooms: ['A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19', 'A20'],
    codes: ['Y'],
  },
  'balcony-2': {
    label: '2區陽臺',
    rooms: ['A21', 'A22', 'A23', 'A24', 'A25', 'A26', 'A27', 'A28', 'A29', 'A30'],
    codes: ['Y'],
  },
};

function spotsForPlanGroup(groupKey, spots = planSpots) {
  const group = PLAN_SELECTION_GROUPS[groupKey];
  if (!group) return [];
  const rooms = new Set(group.rooms);
  const codes = new Set(group.codes);
  const roomOrder = new Map(group.rooms.map((room, index) => [room, index]));
  const codeOrder = new Map(group.codes.map((code, index) => [code, index]));
  return (spots || [])
    .filter((spot) => rooms.has(clean(spot.room)) && codes.has(spaceCode(spot)))
    .sort((a, b) => roomOrder.get(a.room) - roomOrder.get(b.room)
      || codeOrder.get(spaceCode(a)) - codeOrder.get(spaceCode(b))
      || clean(a.label).localeCompare(clean(b.label), 'zh-TW'));
}

async function loadPlanRegions() {
  try {
    const response = await fetchAsset('floor-plan-regions.json');
    const data = await response.json();
    if (!Array.isArray(data.regions) || !data.regions.length) return;
    planRegions = data.regions
      .filter((r) => clean(r.room) && clean(r.label))
      .map((r) => ({
        id: String(r.id),
        room: clean(r.room),
        label: clean(r.label),
        code: r.code || spaceCode(r.label),
        shape: r.shape === 'poly' ? 'poly' : 'rect',
        points: Array.isArray(r.points) ? r.points : null,
        x: Number(r.x) || 0, y: Number(r.y) || 0,
        w: Number(r.w) || 0, h: Number(r.h) || 0,
        labelX: Number.isFinite(r.labelX) ? r.labelX : null,
        labelY: Number.isFinite(r.labelY) ? r.labelY : null,
      }));
    planSpots = planRegions;
  } catch (error) {
    // 沒有設定檔屬正常狀況，維持內建標號
    planRegions = null;
    planSpots = SPACE_HOTSPOTS;
  }
}

/**
 * 標籤位置：優先用區域編輯器算好的 labelX/labelY。
 * 沒有的話才退回頂點平均——凹形可能會標在形狀外，但至少不會出錯。
 */
function regionCentroid(region) {
  if (Number.isFinite(region.labelX) && Number.isFinite(region.labelY)) {
    return [region.labelX, region.labelY];
  }
  if (region.shape === 'rect') return [region.x + region.w / 2, region.y + region.h / 2];
  const sum = region.points.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / region.points.length, sum[1] / region.points.length];
}

/** 用 SVG 畫可點區域；文字另外用 HTML 疊，避免被 SVG 的非等比縮放拉變形。 */
function renderRegionShapes() {
  const shapes = planRegions.map((region) => {
    const on = pickedSpotIds.has(region.id);
    const common = `class="plan-region${on ? ' selected' : ''}" vector-effect="non-scaling-stroke"`
      + ` tabindex="0" role="button" aria-pressed="${on}"`
      + ` aria-label="選擇 ${esc(region.room)} ${esc(region.label)}"`
      + ` onclick="togglePlanSpace('${esc(region.id)}')"`
      + ` onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();togglePlanSpace('${esc(region.id)}')}"`;
    const title = `<title>${esc(region.room)} ${esc(region.label)}</title>`;
    if (region.shape === 'poly') {
      const points = region.points.map(([x, y]) => `${x},${y}`).join(' ');
      return `<polygon points="${points}" ${common}>${title}</polygon>`;
    }
    return `<rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" rx="0.15" ${common}>${title}</rect>`;
  }).join('');

  const tags = planRegions.filter((region) => pickedSpotIds.has(region.id)).map((region) => {
    const [cx, cy] = regionCentroid(region);
    return `<span class="plan-tag" style="left:${cx}%;top:${cy}%">${esc(region.room)} ${esc(region.label)}</span>`;
  }).join('');

  return `<svg class="plan-svg" viewBox="0 0 100 100" preserveAspectRatio="none">${shapes}</svg>${tags}`;
}

/* 平面圖固定為 340%；舞台寬度改變時，百分比定位的標號仍會等比跟著縮放。 */
const PLAN_SCALE = 3.4;
let planZoomInitialized = false;

function planBaseWidth() {
  const viewport = document.getElementById('planViewport');
  return Math.max(280, (viewport?.clientWidth || 900) - 2);
}

function applyPlanZoom(keepCenter = true) {
  const viewport = document.getElementById('planViewport');
  const stage = document.getElementById('planStage');
  if (!viewport || !stage) return;
  const previousWidth = stage.offsetWidth || 1;
  const previousHeight = stage.offsetHeight || 1;
  const ratioX = keepCenter ? (viewport.scrollLeft + viewport.clientWidth / 2) / previousWidth : 0.5;
  const ratioY = keepCenter ? (viewport.scrollTop + viewport.clientHeight / 2) / previousHeight : 0.5;

  const width = Math.round(planBaseWidth() * PLAN_SCALE);
  stage.style.width = `${width}px`;
  stage.style.minWidth = `${width}px`;
  stage.style.flexBasis = `${width}px`;

  // 縮放後把原本在看的位置重新捲回畫面中央
  requestAnimationFrame(() => {
    viewport.scrollLeft = Math.max(0, ratioX * stage.offsetWidth - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, ratioY * stage.offsetHeight - viewport.clientHeight / 2);
  });
}

let planResizeTimer = 0;

function initPlanZoom() {
  if (planZoomInitialized) {
    applyPlanZoom(false);
    return;
  }
  planZoomInitialized = true;
  applyPlanZoom(false);
  // 圖片尚未載完時 stage 高度是 0，置中會算到空白處；載完必須重算一次
  const image = document.getElementById("planImage");
  if (image && !(image.complete && image.naturalWidth > 0)) {
    image.addEventListener("load", () => applyPlanZoom(false), { once: true });
  }
  // 轉向或改變視窗大小時重算，倍率是相對於可視寬度的
  window.addEventListener("resize", () => {
    window.clearTimeout(planResizeTimer);
    planResizeTimer = window.setTimeout(() => applyPlanZoom(false), 200);
  });
}

function planImageFailed() {
  const help = document.getElementById('planHelp');
  if (!help) return;
  help.classList.add('plan-error');
  help.innerHTML = '⚠ <b>平面圖載入失敗</b><br>網站上找不到 <code>assets/floor-plan-04.png</code>。'
    + '請確認上傳到 GitHub 時，<b>整個 <code>assets/</code> 資料夾</b>都有一起上傳'
    + '（裡面還有 Excel 匯出要用的 <code>xlsx.full.min.js</code> 與 <code>report-template.xlsx</code>）。';
}

function renderHotspots() {
  if (planRegions) {
    document.getElementById('hotspots').innerHTML = renderRegionShapes();
    return;
  }
  document.getElementById('hotspots').innerHTML = SPACE_HOTSPOTS.map((spot) => `
    <button class="space-hotspot ${spot.correctedLabel ? 'corrected' : ''} ${pickedSpotIds.has(spot.id) ? 'selected' : ''}" style="left:${spot.x}%;top:${spot.y}%;width:${spot.w}%;height:${spot.h}%" onclick="togglePlanSpace('${spot.id}')" title="${esc(spot.room)}${esc(spot.label)}" aria-label="選擇 ${esc(spot.room)} ${esc(spot.label)}" aria-pressed="${pickedSpotIds.has(spot.id)}">${spot.correctedLabel ? `<span>${esc(spot.room)}<br>${esc(spot.label)}</span>` : ''}</button>`).join('');
}

function renderPlanState() {
  pickedSpotIds = new Set();
  draftMaterials = {};
  renderHotspots();
  renderSelection();
  calculate();
}

function togglePlanSpace(id) {
  if (pickedSpotIds.has(id)) pickedSpotIds.delete(id);
  else pickedSpotIds.add(id);
  draftMaterials = {};
  renderHotspots();
  renderSelection();
  calculate();
}

function selectPlanGroup(groupKey) {
  const selector = document.getElementById('planGroup');
  if (selector) selector.value = '';
  if (!groupKey) return;
  const group = PLAN_SELECTION_GROUPS[groupKey];
  const spots = spotsForPlanGroup(groupKey);
  if (!group || !spots.length) return toast('此區域目前沒有可選取的空間', true);
  pickedSpotIds = new Set(spots.map((spot) => spot.id));
  draftMaterials = {};
  renderHotspots();
  renderSelection();
  calculate();
  const roomCount = new Set(spots.map((spot) => spot.room)).size;
  toast(`${group.label}：已選取 ${roomCount} 戶／${spots.length} 區`);
}

function clearSelection() {
  const selector = document.getElementById('planGroup');
  if (selector) selector.value = '';
  pickedSpotIds = new Set();
  draftMaterials = {};
  renderHotspots();
  renderSelection();
  calculate();
}

function renderSelection() {
  const root = document.getElementById('selection');
  const spots = selectedSpots();
  root.innerHTML = spots.length
    ? spots.map((spot) => `<button type="button" class="area-chip" onclick="togglePlanSpace('${spot.id}')">${esc(spot.room)} ${esc(spot.label)} <span>×</span></button>`).join('')
    : '<span class="selection-empty">尚未選取；請直接點平面圖中的空間標號</span>';
  const rooms = new Set(spots.map((spot) => spot.room));
  document.getElementById('selectedCount').textContent = `${rooms.size} 戶／${spots.length} 區`;
}

function selectedRows() {
  const floor = document.getElementById('floor').value;
  const keys = new Set(selectedSpots().map((spot) => `${spot.room}|${spot.code}`));
  return db.source.filter((row) => row.floor === floor
    && keys.has(`${row.room}|${spaceCode(row.space)}`));
}

function reportItems() {
  const rooms = new Map();
  selectedSpots().forEach((spot) => {
    if (!rooms.has(spot.room)) rooms.set(spot.room, []);
    rooms.get(spot.room).push({ label: spot.label, code: spot.code });
  });
  return [...rooms.entries()].map(([room, spaces]) => ({ room, spaces }));
}

function materialItems() {
  const work = document.getElementById('work').value;
  const found = new Map();
  const aliases = workAliases(work);
  selectedRows().forEach((row) => Object.entries(row.materials || {}).forEach(([sourceWork, materials]) => {
    if (!aliases.has(workIdentity(sourceWork)) || !Array.isArray(materials)) return;
    materials.forEach((material) => {
      const key = `${work}|${material.category}|${material.name}|${material.unit}`;
      if (!found.has(key)) found.set(key, { ...material, key, sourceRows: [], planned: 0 });
      const item = found.get(key);
      if (material.sourceCell && !item.sourceRows.includes(material.sourceCell)) item.sourceRows.push(material.sourceCell);
      item.planned += n(material.planned);
    });
  }));
  const selectedWork = db.works.find((item) => item.key === work);
  const configured = selectedWork ? effectiveWorkMaterials(selectedWork) : sourceWorkMaterials(work);
  configured.forEach((material) => {
    const key = `${work}|${material.category}|${material.name}|${material.unit}`;
    if (!found.has(key)) found.set(key, { ...material, key, sourceRows: [], planned: 0 });
  });
  return [...found.values()];
}

function updateMaterial(key, value) {
  draftMaterials[key] = value;
}

function calculate() {
  const root = document.getElementById('materials');
  if (!selectedSpots().length) {
    root.innerHTML = '<div class="material-warning">請直接點選平面圖中的施作空間；系統會列出對應材料，材料用量為選填。</div>';
    return;
  }
  const items = materialItems();
  if (!items.length) {
    root.innerHTML = `<div class="material-warning">${db.source.length
      ? '目前工項與區域沒有對應材料'
      : '尚未匯入數量明細 Excel，且後台未設定連動材料'}；仍可只填出工人數送出。</div>`;
    return;
  }
  root.innerHTML = items.map((item) => `
    <div class="material-line">
      <div><div class="mat-name">${esc(item.name)}</div><div class="mat-meta">${esc(item.category)}</div></div>
      <div class="mat-input"><input type="number" min="0" step="0.1" placeholder="0" value="${esc(draftMaterials[item.key] ?? '')}" oninput="updateMaterial(decodeURIComponent('${encodeURIComponent(item.key)}'),this.value)"><span>${esc(item.unit)}</span></div>
    </div>`).join('');
}

function adjustWorkers(delta) {
  const input = document.getElementById('workers');
  input.value = Math.max(0.5, Math.round((n(input.value) + delta) * 2) / 2);
}

function defaultPosition(work) {
  return ({ '磁磚-地磚': 'F', '磁磚-壁磚': 'W', 防水工程: 'W、F', 隔音地板: 'I' })[work] || '';
}

function positionsFor(floor, room, code, work) {
  const matching = db.source.filter((row) => row.floor === floor && row.room === room && spaceCode(row.space) === code);
  let relevant = matching.filter((row) => (row.materials?.[work] || []).length);
  if (!relevant.length && work === '防水工程') relevant = matching;
  const positions = [...new Set(relevant.map((row) => clean(row.position)).filter(Boolean))];
  return positions.length ? positions : [defaultPosition(work)];
}

function buildReportLocations(work, floor, items) {
  const map = new Map();
  (items || []).forEach((item) => normalizedSpaces(item).forEach((space) => {
    positionsFor(floor, item.room, space.code, work).forEach((position) => {
      const key = [work, floor, item.room, space.code, position].join('|');
      if (!map.has(key)) map.set(key, {
        work, floor, room: item.room, code: space.code, position, labels: [],
      });
      const location = map.get(key);
      if (!location.labels.includes(space.label)) location.labels.push(space.label);
    });
  }));
  return [...map.values()];
}

function sourceRowsForLocation(location) {
  return db.source.filter((row) => row.floor === location.floor
    && row.room === location.room
    && spaceCode(row.space) === location.code
    && (!location.position || clean(row.position) === clean(location.position))
    && (row.materials?.[location.work] || []).length);
}

function materialWeight(location, material) {
  return sourceRowsForLocation(location).reduce((sum, row) => sum + (row.materials?.[location.work] || [])
    .filter((item) => item.name === material.name && item.category === material.category)
    .reduce((subtotal, item) => subtotal + n(item.planned), 0), 0);
}

function allocateMaterial(material, locations) {
  const weights = locations.map((location) => materialWeight(location, material));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return locations.map((location, index) => ({
    work: location.work,
    floor: location.floor,
    room: location.room,
    code: location.code,
    position: location.position,
    qty: n(material.qty) * (total ? weights[index] / total : 1 / Math.max(1, locations.length)),
  })).filter((allocation) => allocation.qty > 0);
}

function submitReport() {
  const user = currentUser();
  if (!user) return toast('請先登入', true);
  const reporterName = clean(document.getElementById('reporterName').value);
  const spots = selectedSpots();
  const workersRaw = clean(document.getElementById('workers').value);
  const workers = n(workersRaw);
  const date = clean(document.getElementById('date').value);
  const work = clean(document.getElementById('work').value);
  if (!reporterName) return toast('請填寫填表人姓名', true);
  if (!date) return toast('請選擇施工日期', true);
  if (!work) return toast('目前沒有可填報的工項，請洽管理員', true);
  if (!spots.length) return toast('請直接從平面圖選擇至少一個施作空間', true);
  if (!workersRaw || workers < 0.5 || Math.abs(workers * 2 - Math.round(workers * 2)) > 1e-9) {
    return toast('出工人數須至少 0.5，並以 0.5 工為單位', true);
  }
  const listed = materialItems();
  const materials = [];
  for (const item of listed) {
    const raw = draftMaterials[item.key];
    if (raw === '' || raw == null) continue;
    const quantity = n(raw);
    if (quantity <= 0) return toast(`${item.name} 的實際用量須大於 0；不填請留白`, true);
    materials.push({
      name: item.name,
      category: item.category,
      unit: item.unit,
      qty: quantity,
      sourceRows: item.sourceRows,
    });
  }
  const items = reportItems();
  const floor = document.getElementById('floor').value;
  const locations = buildReportLocations(work, floor, items);
  materials.forEach((material) => { material.allocations = allocateMaterial(material, locations); });
  pendingReport = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    date,
    reporter: reporterName,
    reporterId: user ? user.account : '',
    floor,
    items,
    locations,
    work,
    workers,
    materials,
    note: clean(document.getElementById('note').value),
  };
  const locationText = items.map((item) => `${item.room}（${item.spaces.map((space) => space.label).join('、')}）`).join('；');
  const materialText = materials.length
    ? materials.map((item) => `${item.name} ${fmt(item.qty)}${item.unit}`).join('、')
    : '未填列材料用量';
  document.getElementById('confirmSummary').innerHTML = `
    <dt>填表人</dt><dd>${esc(pendingReport.reporter)}</dd>
    <dt>施工日期</dt><dd>${esc(pendingReport.date)}</dd>
    <dt>樓層／工項</dt><dd>${esc(pendingReport.floor)}F／${esc(workLabel(pendingReport.work))}</dd>
    <dt>施作區域</dt><dd>${esc(locationText)}</dd>
    <dt>出工人數</dt><dd>${fmt(pendingReport.workers)} 工</dd>
    <dt>材料用量</dt><dd>${esc(materialText)}</dd>`;
  document.getElementById('confirmSubmitBtn').disabled = false;
  document.getElementById('confirmModal').classList.remove('hidden');
}

function cancelSubmit() {
  pendingReport = null;
  document.getElementById('confirmModal').classList.add('hidden');
}

async function commitReport() {
  if (!pendingReport) return;
  const button = document.getElementById('confirmSubmitBtn');
  button.disabled = true;
  try {
    await api('addReport', { report: pendingReport });
    pendingReport = null;
    document.getElementById('confirmModal').classList.add('hidden');
    clearSelection();
    document.getElementById('note').value = '';
    if (isAdmin()) {
      await syncState();
      renderReports();
    }
    toast('施工回報已確實送出並同步儲存');
  } catch (error) {
    button.disabled = false;
    if (error.status === 401 || error.status === 403) {
      authUser = null;
      applyAccess();
    }
    toast(`送出失敗：${error.message}`, true);
  }
}

function itemText(report) {
  return (report.items || []).map((item) => `${item.room}（${normalizedSpaces(item).map((space) => space.label).join('、')}）`).join('；');
}

function matText(report) {
  return (report.materials || []).map((item) => `${item.name} ${fmt(item.qty)}${item.unit}`).join('、') || '—';
}

function renderReports() {
  const root = document.getElementById('reportBody');
  const query = clean(document.getElementById('reportSearch').value).toLowerCase();
  const rows = db.reports.filter((report) => !query || [
    report.date, report.reporter, report.floor, itemText(report), report.work,
  ].join(' ').toLowerCase().includes(query));
  root.innerHTML = rows.map((report) => `
    <tr>
      <td>${esc(report.date)}</td><td>${esc(report.reporter)}</td><td><span class="badge">${esc(report.floor)}F</span></td>
      <td>${esc(itemText(report))}</td><td>${esc(workLabel(report.work))}</td><td>${fmt(report.workers)}</td>
      <td>${esc(matText(report))}</td><td>${esc(report.note || '')}</td>
      <td><button class="btn danger" onclick="removeReport('${esc(report.id)}')">刪除</button></td>
    </tr>`).join('') || '<tr><td colspan="9"><div class="empty">尚無回報紀錄</div></td></tr>';
}

async function removeReport(id) {
  if (!isAdmin()) return toast('沒有刪除回報的權限', true);
  if (!window.confirm('確定刪除這筆回報？')) return;
  try {
    await api('deleteReport', { id });
    await syncState();
    renderReports();
    toast('回報已刪除');
  } catch (error) {
    toast(error.message, true);
  }
}

function colName(index) {
  let name = '';
  for (let value = index + 1; value; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
  }
  return name;
}

function materialUnit(name, field) {
  const unitMatch = clean(field).match(/[（(]\s*([^）)]+)\s*[）)]/);
  if (unitMatch && !/數量|用量/.test(unitMatch[1])) return unitMatch[1];
  if (field.includes('箱')) return '箱';
  if (field.includes('塊')) return '塊';
  if (/m[²2]|㎡|平方公尺/i.test(field)) return 'm²';
  if (/m[³3]|立方公尺/i.test(field)) return 'm³';
  if (/公斤|\bkg\b/i.test(field)) return 'kg';
  if (/公升|\bL\b/.test(field)) return 'L';
  if (/砂/.test(name)) return 'm³';
  if (/A膠|B膠/.test(name)) return 'kg';
  if (/TF\d*|TG\d*|水泥|黏著|填縫|益膠泥/i.test(name)) return '包';
  return '';
}

function normalizeExcelWork(excelWork) {
  const text = clean(excelWork);
  return ({
    地磚: '磁磚-地磚',
    壁磚: '磁磚-壁磚',
    防水: '防水工程',
    隔音地坪: '隔音地板',
    隔音地墊: '隔音地板',
  })[text] || text;
}

function excelWorkName(key, excelWork) {
  return DEFAULT_WORKS.find((item) => item.key === key)?.name || clean(excelWork) || key;
}

function excelHeaderLayout(rows) {
  const candidates = rows.slice(0, 10);
  let fieldRowIndex = candidates.findIndex((row) => (
    /樓層/.test(clean(row?.[0]))
    && /房號/.test(clean(row?.[1]))
    && /空間/.test(clean(row?.[2]))
  ));
  // 相容既有範本：第 5 列是欄位名稱。若使用者在上方增減標題列，則由樓層／房號／空間自動定位。
  if (fieldRowIndex < 0) fieldRowIndex = Math.min(4, Math.max(0, rows.length - 2));

  const positionCodes = /^(F|W|I|B|K|Y|廊|廳)$/i;
  let workRowIndex = 1;
  let bestWorkScore = -1;
  for (let rowIndex = 0; rowIndex < fieldRowIndex; rowIndex += 1) {
    const values = (rows[rowIndex] || []).slice(6).map(clean).filter(Boolean);
    const textValues = values.filter((value) => !positionCodes.test(value));
    const workWords = textValues.filter((value) => /工程|磁磚|地磚|壁磚|地坪|地板|打底|防水|隔音|油漆|清潔/.test(value));
    const score = textValues.length + workWords.length * 3;
    if (score > bestWorkScore) {
      bestWorkScore = score;
      workRowIndex = rowIndex;
    }
  }

  let positionRowIndex = Math.min(workRowIndex + 1, fieldRowIndex - 1);
  let bestPositionScore = -1;
  for (let rowIndex = workRowIndex + 1; rowIndex < fieldRowIndex; rowIndex += 1) {
    const score = (rows[rowIndex] || []).slice(6).filter((value) => positionCodes.test(clean(value))).length;
    if (score > bestPositionScore) {
      bestPositionScore = score;
      positionRowIndex = rowIndex;
    }
  }
  const categoryRowIndex = [...Array(fieldRowIndex).keys()]
    .reverse()
    .find((rowIndex) => rowIndex !== workRowIndex && rowIndex !== positionRowIndex) ?? positionRowIndex;
  return { workRowIndex, positionRowIndex, categoryRowIndex, fieldRowIndex };
}

function buildWorkSchemas(rows) {
  const layout = excelHeaderLayout(rows);
  const workRow = rows[layout.workRowIndex] || [];
  const positionRow = rows[layout.positionRowIndex] || [];
  const categoryRow = rows[layout.categoryRowIndex] || [];
  const fieldRow = rows[layout.fieldRowIndex] || [];
  const starts = [];
  workRow.forEach((value, index) => {
    const text = clean(value);
    // 同一工項可能在 Excel 的每個材料欄重複顯示，也可能只出現在合併儲存格首欄。
    // 連續同名欄只能建立一個工項區段，否則 CE:CG 的「打底」會被切成三段而漏料。
    if (index >= 6 && text) {
      const field = clean(fieldRow[index]);
      const columnCategory = clean(categoryRow[index]);
      // 有些版本的 CG2 誤填為「地磚」，但 CG4/CG5 明確是「打底／底-砂」。
      // 材料欄證據較具體，遇到這種不一致時以材料分類與「底-」前綴校正歸屬。
      const inferredText = /^底\s*[-－]/.test(field) || columnCategory === '打底' ? '打底' : text;
      const work = normalizeExcelWork(inferredText);
      const previous = starts.at(-1);
      if (!previous || workIdentity(previous.work) !== workIdentity(work)) {
        starts.push({ excelWork: inferredText, work, name: excelWorkName(work, inferredText), start: index, last: index });
      } else {
        previous.last = index;
      }
    }
  });
  const schemas = starts.map((group, index) => {
    const lastPositionColumn = positionRow.reduce((last, value, column) => (
      column >= group.start && clean(value) ? column : last
    ), group.last);
    const end = starts[index + 1]
      ? starts[index + 1].start - 1
      : Math.max(group.last, lastPositionColumn);
    const meta = [];
    let category = '';
    let position = '';
    for (let column = group.start; column <= end; column += 1) {
      if (clean(positionRow[column])) position = clean(positionRow[column]);
      if (clean(categoryRow[column])) category = clean(categoryRow[column]);
      meta.push({ column, position, category, field: clean(fieldRow[column]) });
    }
    const definitions = [];
    meta.forEach((item, metaIndex) => {
      if (!item.field) return;
      if (/^(型號|材料名稱|品名)$/.test(item.field)) {
        const following = meta.slice(metaIndex + 1);
        const nextMaterialField = following.findIndex((other) => /^(型號|材料名稱|品名)$/.test(other.field));
        const sameMaterialColumns = nextMaterialField >= 0 ? following.slice(0, nextMaterialField) : following;
        const quantity = sameMaterialColumns.find((other) => /^(數量|用量)/.test(other.field)
          && (!item.category || !other.category || other.category === item.category));
        if (quantity) {
          definitions.push({
            kind: 'model', ...item, qtyCol: quantity.column,
            unit: materialUnit('', quantity.field),
          });
        }
      } else if (!/^(數量|用量|單位|備註|合計|小計)/.test(item.field)
        && !/面積|高度|寬度|周長/.test(item.field)) {
        definitions.push({
          kind: 'named', name: item.field, ...item,
          unit: materialUnit(item.field, item.field),
        });
      }
    });
    return { ...group, end, definitions, positions: meta.map((item) => item.position).filter(Boolean) };
  }).filter((schema) => !/^(扣除面積|基本資料|各項係數設定|係數設定)$/.test(clean(schema.excelWork)));
  // 讓匯入端能從實際偵測到的欄位列開始讀資料，同時保留陣列介面供既有程式使用。
  schemas.dataStart = layout.fieldRowIndex + 1;
  schemas.layout = layout;
  return schemas;
}

function extractRowMaterials(row, rowNumber, schemas) {
  const output = {};
  schemas.forEach((schema) => {
    const list = output[schema.work] || [];
    schema.definitions.forEach((definition) => {
      const raw = row[definition.column];
      if (definition.kind === 'model') {
        const model = clean(raw);
        if (model && model !== '-' && model !== '0' && !model.startsWith('#')) {
          list.push({
            name: model,
            category: definition.category,
            unit: definition.unit,
            planned: n(row[definition.qtyCol]),
            sourceCell: `${colName(definition.column)}${rowNumber}`,
          });
        }
      } else if (clean(raw) !== '' && n(raw) > 0) {
        list.push({
          name: definition.name,
          category: definition.category,
          unit: definition.unit,
          planned: n(raw),
          sourceCell: `${colName(definition.column)}${rowNumber}`,
        });
      }
    });
    output[schema.work] = list;
  });
  return output;
}

function detectedWorksFromSource(source, schemas) {
  const grouped = new Map();
  schemas.forEach((schema) => {
    if (!grouped.has(schema.work)) grouped.set(schema.work, {
      key: schema.work, name: schema.name, materials: [],
    });
    const work = grouped.get(schema.work);
    schema.definitions.filter((definition) => definition.kind === 'named').forEach((definition) => {
      work.materials.push({
        name: definition.name,
        category: definition.category || '一般材料',
        unit: definition.unit,
      });
    });
  });
  source.forEach((row) => Object.entries(row.materials || {}).forEach(([key, materials]) => {
    if (!grouped.has(key)) grouped.set(key, { key, name: excelWorkName(key, key), materials: [] });
    grouped.get(key).materials.push(...materials);
  }));
  return [...grouped.values()].map((work) => ({ ...work, materials: uniqueMaterials(work.materials) }));
}

async function importExcel(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!isAdmin()) {
    event.target.value = '';
    return toast('只有後台管理權限可以匯入數量資料', true);
  }
  try {
    if (typeof XLSX === 'undefined') throw new Error('Excel 元件尚未載入');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheetName = workbook.SheetNames.find((name) => name.trim() === '數量明細表');
    if (!sheetName) throw new Error('找不到「數量明細表」');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1, defval: null, raw: true,
    });
    const schemas = buildWorkSchemas(rows);
    if (!schemas.length) throw new Error('無法從表頭辨識工項與對應材料欄位');
    const dataStart = schemas.dataStart ?? 5;
    const source = rows.slice(dataStart).map((row, index) => ({ rowNumber: index + dataStart + 1, row }))
      .filter((item) => item.row[0] != null && item.row[1] != null && item.row[2] != null)
      .map(({ row, rowNumber }) => ({
        id: rowNumber,
        rowNumber,
        floor: clean(row[0]).replace(/F$/i, ''),
        room: `A${clean(row[1]).replace(/^A/i, '').padStart(2, '0')}`,
        space: clean(row[2]),
        position: clean(row[3]),
        area: n(row[5]),
        materials: extractRowMaterials(row, rowNumber, schemas),
      }));
    const detectedWorks = detectedWorksFromSource(source, schemas);
    await api('setSource', { source, sourceName: file.name, detectedWorks });
    await syncState();
    initFloor();
    initWorkOptions();
    renderSource();
    renderWorkItems();
    clearSelection();
    toast(`已匯入 ${db.source.length} 筆資料，自動同步 ${detectedWorks.length} 個工項`);
  } catch (error) {
    toast(`匯入失敗：${error.message}`, true);
  } finally {
    event.target.value = '';
  }
}

function sourceMaterialText(row, work) {
  return (row.materials?.[work] || []).map((item) => `${item.name}〔${item.sourceCell}〕`).join('、');
}

function sourceWorks() {
  const keys = new Set();
  db.source.forEach((row) => Object.entries(row.materials || {}).forEach(([key, materials]) => {
    // 工項可能只有施作面積而沒有材料欄（例如防水工程），仍屬於 Excel 已辨識工項。
    if (Array.isArray(materials)) keys.add(key);
  }));
  const ordered = db.works.filter((work) => keys.delete(work.key));
  keys.forEach((key) => ordered.push({ key, name: workLabel(key) }));
  return ordered;
}

function renderSource() {
  document.getElementById('sourceName').textContent = db.sourceName || '尚未匯入';
  document.getElementById('sourceRows').textContent = `${db.source.length} 筆`;
  const floorList = [...new Set(db.source.map((row) => row.floor))].sort((a, b) => n(a) - n(b));
  document.getElementById('sourceFloors').textContent = floorList.length ? `${floorList[0]}F–${floorList.at(-1)}F` : '—';
  const works = sourceWorks();
  document.getElementById('sourceWorks').textContent = `${works.length} 項`;
  document.getElementById('sourceHead').innerHTML = [
    '<th>樓層</th><th>房號</th><th>空間</th><th>位置</th>',
    ...works.map((work) => `<th>${esc(work.name)}材料</th>`),
  ].join('');
  const query = clean(document.getElementById('sourceSearch').value).toLowerCase();
  const rows = db.source.filter((row) => !query || [
    row.floor, row.room, row.space, row.position,
    ...works.map((work) => sourceMaterialText(row, work.key)),
  ].join(' ').toLowerCase().includes(query));
  document.getElementById('sourceBody').innerHTML = rows.slice(0, 1000).map((row) => `
    <tr><td>${esc(row.floor)}F</td><td>${esc(row.room)}</td><td>${esc(row.space)}</td><td>${esc(row.position)}</td>
    ${works.map((work) => `<td>${esc(sourceMaterialText(row, work.key))}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${4 + works.length}"><div class="empty">尚無資料</div></td></tr>`;
}

function reportLocations(report) {
  if (Array.isArray(report.locations) && report.locations.length) {
    return report.locations.map((location) => ({
      work: location.work || report.work,
      floor: clean(location.floor || report.floor),
      room: location.room,
      code: spaceCode(location.code),
      position: clean(location.position) || defaultPosition(report.work),
      labels: Array.isArray(location.labels) ? location.labels : [],
    }));
  }
  return buildReportLocations(report.work, clean(report.floor), report.items || []);
}

function locationKey(location) {
  return [location.work, location.floor, location.room, location.code, location.position].join('|');
}

function materialMapKey(item) {
  return `${item.category}|${item.name}`;
}

function addMaterial(map, item, quantity) {
  const key = materialMapKey(item);
  const current = map.get(key) || {
    name: item.name, category: item.category, unit: item.unit, qty: 0,
  };
  current.qty += n(quantity);
  map.set(key, current);
}

function locationArea(location) {
  return db.source.filter((row) => row.floor === location.floor
    && row.room === location.room
    && spaceCode(row.space) === location.code
    && clean(row.position) === clean(location.position))
    .reduce((sum, row) => sum + n(row.area), 0);
}

function aggregateFeedback() {
  const groups = new Map();
  const ensureGroup = (location) => {
    const key = locationKey(location);
    if (!groups.has(key)) groups.set(key, {
      ...location,
      labels: new Set(location.labels || []),
      reporters: new Set(),
      dates: new Set(),
      workers: 0,
      area: locationArea(location),
      actual: new Map(),
    });
    return groups.get(key);
  };
  for (const report of db.reports) {
    const locations = reportLocations(report);
    locations.forEach((location) => {
      const group = ensureGroup(location);
      (location.labels || []).forEach((label) => group.labels.add(label));
      group.reporters.add(report.reporter);
      group.dates.add(report.date);
      group.workers += n(report.workers);
    });
    for (const material of report.materials || []) {
      if (Array.isArray(material.allocations) && material.allocations.length) {
        material.allocations.forEach((allocation) => {
          const location = {
            work: allocation.work || report.work,
            floor: clean(allocation.floor || report.floor),
            room: allocation.room,
            code: spaceCode(allocation.code),
            position: clean(allocation.position) || defaultPosition(report.work),
            labels: [],
          };
          addMaterial(ensureGroup(location).actual, material, allocation.qty);
        });
      } else {
        const weights = locations.map((location) => materialWeight(location, material));
        const total = weights.reduce((sum, value) => sum + value, 0);
        locations.forEach((location, index) => {
          const share = total ? weights[index] / total : 1 / Math.max(1, locations.length);
          if (share > 0) addMaterial(ensureGroup(location).actual, material, n(material.qty) * share);
        });
      }
    }
  }
  return [...groups.values()].sort((a, b) => n(a.floor) - n(b.floor)
    || a.room.localeCompare(b.room, 'zh-TW')
    || a.work.localeCompare(b.work, 'zh-TW')
    || a.code.localeCompare(b.code, 'zh-TW')
    || a.position.localeCompare(b.position, 'zh-TW'));
}

function getMaterial(group, name) {
  return [...group.actual.values()].find((item) => item.name === name)?.qty ?? '';
}

function tileModels(group) {
  return [...group.actual.values()].filter((item) => item.category === '磁磚');
}

function exportRow(group) {
  const row = Array(24).fill('');
  row[0] = exportWorkLabel(group.work);
  row[1] = [...group.reporters].join('、');
  row[2] = `${group.floor}F`;
  row[3] = group.room;
  row[4] = group.code;
  row[5] = group.position;
  row[6] = group.dates.size;
  if (group.work === '磁磚-地磚') {
    const models = tileModels(group);
    row[7] = [...new Set(models.map((item) => item.name))].join('、');
    row[8] = models.reduce((sum, item) => sum + n(item.qty), 0) || '';
    row[9] = getMaterial(group, 'TF830');
    row[10] = getMaterial(group, 'TG67');
    row[11] = getMaterial(group, 'TG63(細)');
  } else if (group.work === '磁磚-壁磚') {
    const models = tileModels(group);
    row[12] = [...new Set(models.map((item) => item.name))].join('、');
    row[13] = models.reduce((sum, item) => sum + n(item.qty), 0) || '';
    row[14] = getMaterial(group, 'TF850');
    row[15] = getMaterial(group, 'TG67');
    row[16] = getMaterial(group, 'TG63(細)');
  } else if (group.work === '隔音地板') {
    row[17] = getMaterial(group, 'A膠');
    row[18] = getMaterial(group, 'B膠');
    row[19] = getMaterial(group, '隔-水泥');
    row[20] = getMaterial(group, '隔-砂');
    row[21] = getMaterial(group, '底-TF830');
    row[22] = getMaterial(group, '底-水泥');
    row[23] = getMaterial(group, '底-砂');
  }
  return row;
}

function writeExportCell(sheet, row, column, value) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const numeric = typeof value === 'number';
  sheet[address] = {
    v: value,
    t: numeric ? 'n' : 's',
    s: {
      font: { name: 'Microsoft JhengHei', sz: 10, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'B7B7B7' } },
        bottom: { style: 'thin', color: { rgb: 'B7B7B7' } },
        left: { style: 'thin', color: { rgb: 'B7B7B7' } },
        right: { style: 'thin', color: { rgb: 'B7B7B7' } },
      },
      numFmt: numeric ? '0.###' : 'General',
    },
  };
}

function addStatisticsSheet(workbook, groups) {
  const values = [[
    '工項', '主辦工程師', '樓層', '房號', '空間', '位置', '施作天數', '總出工人數', '施作面積', '空間名稱',
  ], ...groups.map((group) => [
    exportWorkLabel(group.work), [...group.reporters].join('、'), `${group.floor}F`, group.room,
    group.code, group.position, group.dates.size, group.workers, group.area,
    [...group.labels].join('、'),
  ])];
  const sheet = XLSX.utils.aoa_to_sheet(values);
  sheet['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 9 },
    { wch: 9 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 24 },
  ];
  values.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    if (!sheet[address]) return;
    sheet[address].s = {
      font: { name: 'Microsoft JhengHei', sz: rowIndex ? 10 : 11, bold: rowIndex === 0 },
      fill: rowIndex === 0 ? { patternType: 'solid', fgColor: { rgb: 'DCE6F1' } } : undefined,
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: 'A6A6A6' } },
        bottom: { style: 'thin', color: { rgb: 'A6A6A6' } },
        left: { style: 'thin', color: { rgb: 'A6A6A6' } },
        right: { style: 'thin', color: { rgb: 'A6A6A6' } },
      },
    };
  }));
  const name = '施工統計補充';
  workbook.Sheets[name] = sheet;
  if (!workbook.SheetNames.includes(name)) workbook.SheetNames.push(name);
}

async function exportReports() {
  if (!isAdmin()) return toast('只有後台管理權限可以匯出 Excel', true);
  if (!db.reports.length) return toast('尚無回報紀錄可匯出', true);
  try {
    if (typeof XLSX === 'undefined') throw new Error('Excel 元件尚未載入，請確認 xlsx.full.min.js 已上傳');
    const response = await fetchAsset('report-template.xlsx');
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array', cellStyles: true });
    const sheetName = workbook.SheetNames.find((name) => name.trim() === '實際用量回饋表');
    if (!sheetName) throw new Error('範本缺少「實際用量回饋表」');
    const sheet = workbook.Sheets[sheetName];
    const groups = aggregateFeedback();
    groups.forEach((group, index) => exportRow(group)
      .forEach((value, column) => writeExportCell(sheet, index + 2, column, value)));
    sheet['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 }, e: { r: Math.max(1, groups.length + 1), c: 23 },
    });
    sheet['!rows'] = sheet['!rows'] || [];
    groups.forEach((_, index) => { sheet['!rows'][index + 2] = { hpt: 18 }; });
    addStatisticsSheet(workbook, groups);
    XLSX.writeFile(workbook, `東仁安居_回報檔案_${today()}.xlsx`, { cellStyles: true });
    toast(`已依新版格式匯出 ${groups.length} 筆工項／位置統計`);
  } catch (error) {
    toast(`匯出失敗：${error.message}`, true);
  }
}

async function initialize() {
  document.getElementById("date").value = today();
  renderHotspots();
  document.getElementById("loginPassword")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") doLogin();
  });
  if (!API_URL) {
    setConnection(false, "尚未設定後端網址");
    showLogin("尚未設定後端網址，請先編輯 config.js");
    return;
  }
  if (!sessionToken) {
    setConnection(false, "尚未登入");
    showLogin();
    return;
  }
  // 有舊權杖就直接續用；失效時 api() 會自動導回登入畫面
  try {
    await enterApp();
  } catch (error) {
    setConnection(false, "尚未登入");
    if (error.code !== "unauthorized" && error.code !== "disabled") {
      showLogin(error.message);
    }
  }
}

initialize();
