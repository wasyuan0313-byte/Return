const AUTHORITY_OWNER = 'yuan0914';
const DEVICE_KEY = 'dongren-work-report-device-code-v1';
const LEGACY_KEY = 'dongren-work-report-v3';
const MIGRATION_KEY = 'dongren-work-report-server-migrated-v1';

let db = {
  reports: [],
  source: [],
  sourceName: '',
  users: [],
  nextUserId: '01',
  nextPermissionCode: 'UG015001',
};
let authUser = null;
let managerIdentifier = '';
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

function spaceCode(value) {
  const text = clean(typeof value === 'object' ? value.code || value.label : value);
  if (['B', 'K', 'I', 'Y', '廊', '廳'].includes(text)) return text;
  if (/廁所/.test(text)) return 'B';
  if (/廚房/.test(text)) return 'K';
  if (/陽台/.test(text)) return 'Y';
  if (/室內|臥室|主臥|客廳/.test(text)) return 'I';
  if (/走廊/.test(text)) return '廊';
  return text;
}

function normalizedSpaces(item) {
  return (item.spaces || []).map((space) => (typeof space === 'string'
    ? { label: space, code: spaceCode(space) }
    : { label: space.label || space.code, code: spaceCode(space) }));
}

function deviceCode() {
  return clean(localStorage.getItem(DEVICE_KEY)).toUpperCase();
}

function permissionCodeFromSuffix(value) {
  const suffix = clean(value);
  return /^[0-9]{3}$/.test(suffix) && suffix !== '000' ? `UG015${suffix}` : '';
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.auth !== false) {
    if (managerIdentifier) headers.set('X-Manager-Identifier', managerIdentifier);
    else if (deviceCode()) headers.set('X-Permission-Code', deviceCode());
  }
  let response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (cause) {
    const host = globalThis.location?.hostname || '';
    const localHint = host && host !== '127.0.0.1' && host !== 'localhost'
      ? '；若在伺服器本機操作，請改開 http://127.0.0.1:8765/'
      : '';
    throw new Error(`無法連接回報伺服器${localHint}`, { cause });
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message = typeof payload.error === 'string'
      ? payload.error
      : payload.error?.message || `伺服器錯誤（${response.status}）`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setConnection(ok, text) {
  const element = document.getElementById('connectionStatus');
  element.textContent = text || (ok ? '集中資料庫連線正常' : '伺服器未連線');
  element.style.borderColor = ok ? '#9be1c9' : '#f1afb5';
  element.style.background = ok ? '#effdf7' : '#fff1f2';
  element.style.color = ok ? '#087256' : '#a62f3a';
}

async function syncState() {
  const state = await api('/api/state');
  authUser = state.currentUser || null;
  db = {
    reports: Array.isArray(state.reports) ? state.reports : [],
    source: Array.isArray(state.source) ? state.source : [],
    sourceName: state.sourceName || '',
    users: Array.isArray(state.users) ? state.users : [],
    nextUserId: state.nextUserId || '01',
    nextPermissionCode: state.nextPermissionCode || 'UG015001',
  };
  setConnection(true);
}

function currentUser() {
  return authUser;
}

function isManager() {
  return Boolean(managerIdentifier);
}

function isAdmin() {
  return isManager() || currentUser()?.role === 'admin';
}

function showLogin(switching = false) {
  document.getElementById('loginModal').classList.remove('hidden');
  document.getElementById('loginCancel').classList.toggle('hidden', !switching);
  const remembered = deviceCode();
  document.getElementById('loginCode').value = /^UG015[0-9]{3}$/.test(remembered) ? remembered.slice(-3) : '';
  document.getElementById('loginCode').focus();
}

function hideLogin() {
  if (currentUser() || isManager()) document.getElementById('loginModal').classList.add('hidden');
}

async function loginByCode() {
  const suffix = clean(document.getElementById('loginCode').value);
  const code = permissionCodeFromSuffix(suffix);
  if (!code) return toast('請輸入登入碼末三碼，例如 001', true);
  try {
    const result = await api('/api/login', { method: 'POST', body: { suffix }, auth: false });
    localStorage.setItem(DEVICE_KEY, code);
    managerIdentifier = '';
    const user = result.user || result.currentUser;
    authUser = user;
    await syncState();
    document.getElementById('loginModal').classList.add('hidden');
    applyAccess();
    setMode('front');
    toast(`裝置 ${user.id} 已連動：${user.name}`);
  } catch (error) {
    toast(error.message, true);
  }
}

function showManagerLogin() {
  document.getElementById('loginModal').classList.add('hidden');
  document.getElementById('managerModal').classList.remove('hidden');
  document.getElementById('managerIdentifier').value = '';
  document.getElementById('managerIdentifier').focus();
}

function hideManagerLogin() {
  document.getElementById('managerModal').classList.add('hidden');
  showLogin(true);
}

async function migrateLegacyIfNeeded() {
  if (localStorage.getItem(MIGRATION_KEY) || !isManager()) return;
  let legacy = {};
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}');
  } catch {
    legacy = {};
  }
  const reports = Array.isArray(legacy.reports) ? legacy.reports : [];
  const source = Array.isArray(legacy.source) ? legacy.source : [];
  if (!reports.length && !source.length) {
    localStorage.setItem(MIGRATION_KEY, 'none');
    return;
  }
  try {
    const result = await api('/api/migrate', {
      method: 'POST',
      body: { reports, source, sourceName: legacy.sourceName || '' },
    });
    localStorage.setItem(MIGRATION_KEY, 'done');
    if (result.migratedReports || result.migratedSource) {
      toast(`已將舊版資料移入集中資料庫（回報 ${result.migratedReports || 0} 筆）`);
    }
  } catch (error) {
    if (error.status !== 404) toast(`舊資料移轉未完成：${error.message}`, true);
  }
}

async function loginManager() {
  const identifier = clean(document.getElementById('managerIdentifier').value).toLowerCase();
  try {
    await api('/api/manager-login', {
      method: 'POST', body: { identifier }, auth: false,
    });
    managerIdentifier = identifier;
    authUser = null;
    await syncState();
    await migrateLegacyIfNeeded();
    await syncState();
    document.getElementById('managerModal').classList.add('hidden');
    applyAccess();
    setMode('back');
    backTab('permissions');
    toast('已進入主管權限設定；本次關閉頁面後會自動登出主管');
  } catch (error) {
    toast(error.message, true);
  }
}

function applyAccess() {
  const user = currentUser();
  const account = document.getElementById('accountBtn');
  account.textContent = isManager()
    ? `${AUTHORITY_OWNER}｜權限主管`
    : user
      ? `裝置 ${user.id}｜${user.name}｜${user.role === 'admin' ? '後台管理' : '前端登陸'}`
      : '尚未啟用裝置';
  document.getElementById('reporterIdentity').textContent = user
    ? `填表人：${user.name}（${user.id}）`
    : isManager()
      ? '目前為主管設定模式；填報請改用個人權限碼登入'
      : '尚未以權限碼啟用';
  document.getElementById('backBtn').classList.toggle('locked', !isAdmin());
  document.getElementById('permissionTabBtn').classList.toggle('hidden', !isManager());
  if (!isManager() && document.getElementById('permissions').classList.contains('active')) backTab('reports');
  if (!isAdmin() && document.getElementById('back').classList.contains('active')) setMode('front');
  if (!user && !isManager()) showLogin(false);
  renderPermissions();
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
    renderPermissions();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function backTab(id) {
  if (!isAdmin()) return;
  if (id === 'permissions' && !isManager()) return toast('權限碼僅能由統一權限主管設定', true);
  document.querySelectorAll('.back-tab').forEach((element) => element.classList.toggle('active', element.dataset.tab === id));
  document.querySelectorAll('.back-view').forEach((element) => element.classList.toggle('active', element.id === id));
}

function syncPermissionChecks() {
  const admin = document.getElementById('permissionAdmin');
  const front = document.getElementById('permissionFront');
  if (admin.checked) {
    front.checked = true;
    front.disabled = true;
  } else {
    front.disabled = false;
  }
}

async function addPermission() {
  if (!isManager()) return toast('只有統一權限主管可以核發權限碼', true);
  const name = clean(document.getElementById('permissionName').value);
  const admin = document.getElementById('permissionAdmin').checked;
  const front = document.getElementById('permissionFront').checked || admin;
  if (!name) return toast('請輸入使用者姓名', true);
  if (!admin && !front) return toast('請至少勾選一項權限', true);
  try {
    const result = await api('/api/users', {
      method: 'POST', body: { name, admin, front },
    });
    await syncState();
    document.getElementById('permissionName').value = '';
    document.getElementById('permissionAdmin').checked = false;
    document.getElementById('permissionFront').checked = true;
    syncPermissionChecks();
    const issued = document.getElementById('issuedCode');
    issued.classList.remove('hidden');
    issued.innerHTML = `已建立裝置 <b>${esc(result.user.id)}</b>｜${esc(result.user.name)}，首次登入末三碼：<span class="code">${esc(result.user.code.slice(-3))}</span>　<button class="btn" onclick="copyCode('${esc(result.user.code)}')">複製三碼</button>`;
    renderPermissions();
    toast('權限碼已建立並同步至所有裝置');
  } catch (error) {
    toast(error.message, true);
  }
}

async function removePermission(code) {
  if (!isManager()) return toast('只有統一權限主管可以停用權限碼', true);
  if (!window.confirm(`確定停用權限碼 ${code}？`)) return;
  try {
    await api(`/api/users/${encodeURIComponent(code)}/disable`, { method: 'POST', body: {} });
    await syncState();
    renderPermissions();
    toast('權限碼已停用，其他裝置再次操作時也會被阻擋');
  } catch (error) {
    toast(error.message, true);
  }
}

async function enablePermission(code) {
  if (!isManager()) return toast('只有統一權限主管可以重新啟用權限碼', true);
  if (!window.confirm(`確定重新啟用權限碼 ${code}？若原瀏覽器仍保留此裝置資料，下次開啟會自動恢復登入。`)) return;
  try {
    const result = await api(`/api/users/${encodeURIComponent(code)}/enable`, { method: 'POST', body: {} });
    await syncState();
    renderPermissions();
    toast(`${result.user.name} 已重新啟用；保留裝置資料的原瀏覽器下次會自動登入`);
  } catch (error) {
    toast(error.message, true);
  }
}

async function updatePermission(code, checkbox) {
  if (!isManager()) {
    checkbox.checked = !checkbox.checked;
    return toast('只有統一權限主管可以調整後台登入權限', true);
  }
  checkbox.disabled = true;
  try {
    const result = await api(`/api/users/${encodeURIComponent(code)}/permissions`, {
      method: 'POST', body: { admin: checkbox.checked, front: true },
    });
    await syncState();
    renderPermissions();
    toast(`${result.user.name} 已調整為${result.user.role === 'admin' ? '後台管理＋前端填報' : '僅前端填報'}`);
  } catch (error) {
    await syncState().catch(() => {});
    renderPermissions();
    toast(error.message, true);
  }
}

async function copyCode(code) {
  const suffix = clean(code).slice(-3);
  try {
    await navigator.clipboard.writeText(suffix);
    toast(`已複製登入末三碼 ${suffix}`);
  } catch {
    toast(`登入末三碼：${suffix}`);
  }
}

function renderPermissions() {
  const next = document.getElementById('nextUserId');
  const root = document.getElementById('permissionList');
  if (next) next.textContent = db.nextUserId || '01';
  if (!root || !isManager()) {
    if (root) root.innerHTML = '';
    return;
  }
  root.innerHTML = db.users.map((user) => `
    <div class="permission-row">
      <b>${esc(user.id)}</b>
      <div><b>${esc(user.name)}</b> <span class="role-chip ${user.active === false ? 'role-disabled' : 'role-enabled'}">${user.active === false ? '已停用' : '使用中'}</span>${user.code === deviceCode() ? ' <span class="badge">本裝置</span>' : ''}</div>
      <label class="permission-toggle"><input type="checkbox" ${user.role === 'admin' ? 'checked' : ''} onchange="updatePermission('${esc(user.code)}',this)"><span>後台登入</span><small>停用中仍可編輯</small></label>
      <span class="code">裝置 ${esc(user.id)}｜登入 ${esc(user.code.slice(-3))}</span>
      <div class="permission-actions"><button class="btn" onclick="copyCode('${esc(user.code)}')">複製三碼</button> ${user.active === false ? `<button class="btn primary" onclick="enablePermission('${esc(user.code)}')">重新啟用</button>` : `<button class="btn danger" onclick="removePermission('${esc(user.code)}')">停用</button>`}</div>
    </div>`).join('') || '<div class="empty">尚未建立任何使用者權限碼</div>';
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
  return SPACE_HOTSPOTS.filter((spot) => pickedSpotIds.has(spot.id));
}

function renderHotspots() {
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

function clearSelection() {
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
  selectedRows().forEach((row) => (row.materials?.[work] || []).forEach((material) => {
    const key = `${work}|${material.category}|${material.name}|${material.unit}`;
    if (!found.has(key)) found.set(key, { ...material, key, sourceRows: [], planned: 0 });
    const item = found.get(key);
    item.sourceRows.push(material.sourceCell);
    item.planned += n(material.planned);
  }));
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
  if (!db.source.length) {
    root.innerHTML = '<div class="material-warning">尚未匯入數量明細 Excel；仍可只填出工人數送出。</div>';
    return;
  }
  const items = materialItems();
  if (!items.length) {
    root.innerHTML = '<div class="material-warning">目前工項與區域沒有對應材料；仍可只填出工人數送出。</div>';
    return;
  }
  root.innerHTML = items.map((item) => `
    <div class="material-line">
      <div><div class="mat-name">${esc(item.name)}</div><div class="mat-meta">${esc(item.category)}｜Excel ${esc([...new Set(item.sourceRows)].join('、'))}</div></div>
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
  const spots = selectedSpots();
  const workersRaw = clean(document.getElementById('workers').value);
  const workers = n(workersRaw);
  const date = clean(document.getElementById('date').value);
  if (!user) return toast('請先以個人權限碼啟用裝置後再填報', true);
  if (!date) return toast('請選擇施工日期', true);
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
  const work = document.getElementById('work').value;
  const floor = document.getElementById('floor').value;
  const locations = buildReportLocations(work, floor, items);
  materials.forEach((material) => { material.allocations = allocateMaterial(material, locations); });
  pendingReport = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    date,
    reporter: user.name,
    reporterId: user.id,
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
    await api('/api/reports', { method: 'POST', body: pendingReport });
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
    await api(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
  if (field.includes('箱')) return '箱';
  if (field.includes('塊')) return '塊';
  if (/砂/.test(name)) return 'm³';
  if (/A膠|B膠/.test(name)) return 'kg';
  return '包';
}

function buildWorkSchemas(rows) {
  const workRow = rows[1] || [];
  const positionRow = rows[2] || [];
  const categoryRow = rows[3] || [];
  const fieldRow = rows[4] || [];
  const aliases = { 隔音地坪: '隔音地板' };
  const allowed = ['防水工程', '磁磚-地磚', '磁磚-壁磚', '隔音地坪'];
  const starts = [];
  workRow.forEach((value, index) => {
    const text = clean(value);
    if (allowed.includes(text)) starts.push({ excelWork: text, work: aliases[text] || text, start: index });
  });
  return starts.map((group, index) => {
    const end = (starts[index + 1]?.start ?? fieldRow.length) - 1;
    const meta = [];
    let category = '';
    let position = '';
    for (let column = group.start; column <= end; column += 1) {
      if (clean(positionRow[column])) position = clean(positionRow[column]);
      if (clean(categoryRow[column])) category = clean(categoryRow[column]);
      meta.push({ column, position, category, field: clean(fieldRow[column]) });
    }
    const definitions = [];
    meta.forEach((item) => {
      if (item.category === '磁磚' && item.field === '型號') {
        const quantity = meta.find((other) => other.category === '磁磚' && other.field === '數量(箱)')
          || meta.find((other) => other.category === '磁磚' && other.field === '數量(塊)');
        definitions.push({ kind: 'model', ...item, qtyCol: quantity?.column, unit: materialUnit('', quantity?.field || '') });
      } else if (/^(TF|TG|A膠$|B膠$|隔-|底-)/.test(item.field)) {
        definitions.push({ kind: 'named', name: item.field, ...item, unit: materialUnit(item.field, item.field) });
      }
    });
    return { ...group, end, definitions };
  });
}

function extractRowMaterials(row, rowNumber, schemas) {
  const output = {};
  schemas.forEach((schema) => {
    const list = [];
    schema.definitions.forEach((definition) => {
      const raw = row[definition.column];
      if (definition.kind === 'model') {
        const model = clean(raw);
        if (model && model !== '-' && !model.startsWith('#')) {
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
    if (!schemas.some((schema) => schema.work === '磁磚-壁磚'
      && schema.definitions.some((definition) => definition.field === 'TF850'))) {
      throw new Error('無法依表頭定位「磁磚-壁磚／TF850」');
    }
    const source = rows.slice(5).map((row, index) => ({ rowNumber: index + 6, row }))
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
    await api('/api/source', { method: 'POST', body: { source, sourceName: file.name } });
    await syncState();
    initFloor();
    renderSource();
    clearSelection();
    toast(`已匯入並同步 ${db.source.length} 筆數量資料`);
  } catch (error) {
    toast(`匯入失敗：${error.message}`, true);
  } finally {
    event.target.value = '';
  }
}

function sourceMaterialText(row, work) {
  return (row.materials?.[work] || []).map((item) => `${item.name}〔${item.sourceCell}〕`).join('、');
}

function renderSource() {
  document.getElementById('sourceName').textContent = db.sourceName || '尚未匯入';
  document.getElementById('sourceRows').textContent = `${db.source.length} 筆`;
  const floorList = [...new Set(db.source.map((row) => row.floor))].sort((a, b) => n(a) - n(b));
  document.getElementById('sourceFloors').textContent = floorList.length ? `${floorList[0]}F–${floorList.at(-1)}F` : '—';
  const query = clean(document.getElementById('sourceSearch').value).toLowerCase();
  const rows = db.source.filter((row) => !query || [
    row.floor, row.room, row.space, row.position,
    sourceMaterialText(row, '磁磚-地磚'), sourceMaterialText(row, '磁磚-壁磚'), sourceMaterialText(row, '隔音地板'),
  ].join(' ').toLowerCase().includes(query));
  document.getElementById('sourceBody').innerHTML = rows.slice(0, 1000).map((row) => `
    <tr><td>${esc(row.floor)}F</td><td>${esc(row.room)}</td><td>${esc(row.space)}</td><td>${esc(row.position)}</td>
    <td>${esc(sourceMaterialText(row, '磁磚-地磚'))}</td><td>${esc(sourceMaterialText(row, '磁磚-壁磚'))}</td><td>${esc(sourceMaterialText(row, '隔音地板'))}</td></tr>`).join('')
    || '<tr><td colspan="7"><div class="empty">尚無資料</div></td></tr>';
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
    if (typeof XLSX === 'undefined') throw new Error('Excel 元件尚未載入');
    const response = await fetch('assets/report-template.xlsx');
    if (!response.ok) throw new Error('無法載入「回報檔案格式.xlsx」範本');
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
  document.getElementById('date').value = today();
  initFloor();
  renderHotspots();
  renderSelection();
  calculate();
  renderReports();
  renderSource();
  syncPermissionChecks();
  const legacy = (() => {
    try { return JSON.parse(localStorage.getItem(LEGACY_KEY) || '{}'); } catch { return {}; }
  })();
  if (!localStorage.getItem(DEVICE_KEY) && legacy.deviceCode) {
    localStorage.setItem(DEVICE_KEY, clean(legacy.deviceCode).toUpperCase());
  }
  try {
    await api('/api/health', { auth: false });
    setConnection(true);
    if (deviceCode()) {
      try {
        await syncState();
      } catch (error) {
        authUser = null;
        if (error.status !== 401 && error.status !== 403) throw error;
        toast('本裝置的權限碼已失效，請重新登入', true);
      }
    }
  } catch (error) {
    setConnection(false, '伺服器未啟動');
    toast('無法連接集中資料庫，請先啟動 server.py', true);
  }
  initFloor();
  renderSelection();
  calculate();
  renderReports();
  renderSource();
  applyAccess();
}

initialize();
