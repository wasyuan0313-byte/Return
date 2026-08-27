/**
 * 東仁安居工務施工回報系統 — Google Apps Script 後端
 *
 * 部署方式請見 gas/部署說明.md
 *
 * 資料表（同一個 Google 試算表內的分頁）：
 *   users    帳號與密碼雜湊
 *   reports  施工回報（人類可讀 + JSON 還原欄）
 *   sessions 登入工作階段
 *   source   數量明細（JSON 分段存放）
 *   log      操作稽核紀錄
 */

const SHEET_USERS = 'users';
const SHEET_REPORTS = 'reports';
const SHEET_SESSIONS = 'sessions';
const SHEET_SOURCE = 'source';
const SHEET_LOG = 'log';

/** 密碼雜湊迭代次數。調高更安全但登入變慢。 */
const HASH_ITERATIONS = 1000;
/** 登入有效時數。 */
const SESSION_HOURS = 12;
/** 單一儲存格上限 50000 字元，分段大小保留餘裕。 */
const SOURCE_CHUNK_SIZE = 40000;
/** log 分頁保留筆數，超過就從最舊的砍。 */
const LOG_KEEP_ROWS = 3000;

const HEADERS = {};
HEADERS[SHEET_USERS] = ['id', 'name', 'account', 'role', 'active', 'pwHash', 'pwSalt', 'createdAt', 'lastLoginAt'];
HEADERS[SHEET_REPORTS] = ['id', '日期', '填表人', '帳號', '樓層', '工項', '房號空間', '出工人數', '材料用量', '備註', '建立時間', 'itemsJson', 'locationsJson', 'materialsJson'];
HEADERS[SHEET_SESSIONS] = ['token', 'account', 'expiresAt'];
HEADERS[SHEET_SOURCE] = ['key', 'seq', 'value'];
HEADERS[SHEET_LOG] = ['時間', '帳號', '動作', '內容'];

/* ------------------------------------------------------------------ */
/* 一次性安裝                                                          */
/* ------------------------------------------------------------------ */

/**
 * 在 Apps Script 編輯器手動執行一次，建立所有分頁與第一組管理員帳號。
 * 執行前請先改掉下面三個值。
 */
function setup() {
  const ADMIN_NAME = '系統管理員';
  const ADMIN_ACCOUNT = 'admin';
  const ADMIN_PASSWORD = 'ChangeMe2026!';

  Object.keys(HEADERS).forEach(function (name) {
    sheet_(name);
  });

  const users = readRows_(SHEET_USERS);
  if (users.some(function (row) { return String(row.account).toLowerCase() === ADMIN_ACCOUNT.toLowerCase(); })) {
    throw new Error('帳號 ' + ADMIN_ACCOUNT + ' 已存在，setup 不重複建立。');
  }
  createUser_(ADMIN_NAME, ADMIN_ACCOUNT, ADMIN_PASSWORD, 'admin');
  Logger.log('已建立管理員帳號：' + ADMIN_ACCOUNT + '　密碼：' + ADMIN_PASSWORD + '　請登入後立即修改密碼。');
}

/* ------------------------------------------------------------------ */
/* HTTP 進入點                                                          */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, data: { service: 'donren-report', time: new Date().toISOString() } });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: { code: 'bad_json', message: '請求格式錯誤' } });
  }
  try {
    return json_({ ok: true, data: dispatch_(body) });
  } catch (err) {
    return json_({
      ok: false,
      error: { code: err.appCode || 'server_error', message: err.message || String(err) },
    });
  }
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  const error = new Error(message);
  error.appCode = code;
  return error;
}

function dispatch_(body) {
  const action = String(body.action || '');
  const payload = body.payload || {};
  const token = String(body.token || '');

  if (action === 'health') return { service: 'donren-report' };
  if (action === 'login') return actionLogin_(payload);

  const user = requireSession_(token);

  switch (action) {
    case 'logout': return actionLogout_(token, user);
    case 'state': return actionState_(user);
    case 'addReport': return actionAddReport_(user, payload);
    case 'deleteReport': return actionDeleteReport_(user, payload);
    case 'setSource': return actionSetSource_(user, payload);
    case 'changePassword': return actionChangePassword_(user, payload);
    case 'addUser': return actionAddUser_(user, payload);
    case 'setUserRole': return actionSetUserRole_(user, payload);
    case 'setUserActive': return actionSetUserActive_(user, payload);
    case 'resetPassword': return actionResetPassword_(user, payload);
    default: throw fail_('unknown_action', '不支援的操作：' + action);
  }
}

/* ------------------------------------------------------------------ */
/* 試算表存取                                                          */
/* ------------------------------------------------------------------ */

function sheet_(name) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let target = book.getSheetByName(name);
  if (!target) {
    target = book.insertSheet(name);
  }
  const headers = HEADERS[name];
  const first = target.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = first.join('') === '' || first[0] !== headers[0];
  if (needsHeader) {
    target.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    target.setFrozenRows(1);
  }
  return target;
}

/** 讀出整張表為物件陣列，_row 為實際列號（1-based）。 */
function readRows_(name) {
  const target = sheet_(name);
  const headers = HEADERS[name];
  const last = target.getLastRow();
  if (last < 2) return [];
  const values = target.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (row, index) {
    const item = { _row: index + 2 };
    headers.forEach(function (key, column) { item[key] = row[column]; });
    return item;
  }).filter(function (item) { return String(item[headers[0]]) !== ''; });
}

function appendRow_(name, object) {
  const headers = HEADERS[name];
  sheet_(name).appendRow(headers.map(function (key) {
    const value = object[key];
    return value === undefined || value === null ? '' : value;
  }));
}

function updateCell_(name, rowNumber, key, value) {
  const column = HEADERS[name].indexOf(key) + 1;
  if (column < 1) throw fail_('bad_column', '欄位不存在：' + key);
  sheet_(name).getRange(rowNumber, column).setValue(value);
}

/** 寫入時統一上鎖，避免多人同時送出互相覆蓋。 */
function withLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fail_('busy', '系統忙碌中，請稍後再送出一次');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function nowIso_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss");
}

function writeLog_(account, action, detail) {
  try {
    appendRow_(SHEET_LOG, { 時間: nowIso_(), 帳號: account, 動作: action, 內容: detail || '' });
    const target = sheet_(SHEET_LOG);
    const overflow = target.getLastRow() - 1 - LOG_KEEP_ROWS;
    if (overflow > 0) target.deleteRows(2, overflow);
  } catch (err) {
    // 稽核寫入失敗不影響主要流程
  }
}

/* ------------------------------------------------------------------ */
/* 密碼與工作階段                                                      */
/* ------------------------------------------------------------------ */

function toBytes_(text) {
  return Utilities.newBlob(String(text)).getBytes();
}

/** 迭代 HMAC-SHA256，避免明碼與單輪雜湊。 */
function hashPassword_(password, salt) {
  const key = toBytes_(salt);
  let digest = Utilities.computeHmacSha256Signature(toBytes_(password), key);
  for (let i = 1; i < HASH_ITERATIONS; i += 1) {
    digest = Utilities.computeHmacSha256Signature(digest, key);
  }
  return Utilities.base64Encode(digest);
}

function newSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** 定時比較，避免以回應時間反推密碼。 */
function safeEqual_(left, right) {
  const a = String(left);
  const b = String(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function findUserByAccount_(account) {
  const wanted = String(account || '').trim().toLowerCase();
  if (!wanted) return null;
  const rows = readRows_(SHEET_USERS);
  for (let i = 0; i < rows.length; i += 1) {
    if (String(rows[i].account).trim().toLowerCase() === wanted) return rows[i];
  }
  return null;
}

function publicUser_(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    account: String(row.account),
    role: String(row.role),
    active: row.active === true || String(row.active).toUpperCase() === 'TRUE',
    createdAt: String(row.createdAt || ''),
    lastLoginAt: String(row.lastLoginAt || ''),
  };
}

function createUser_(name, account, password, role) {
  const clean = String(account || '').trim();
  if (!/^[A-Za-z0-9._-]{3,20}$/.test(clean)) {
    throw fail_('bad_account', '帳號須為 3–20 碼英數字，可含 . _ -');
  }
  if (String(password || '').length < 6) {
    throw fail_('bad_password', '密碼至少 6 碼');
  }
  if (findUserByAccount_(clean)) throw fail_('account_exists', '帳號已存在：' + clean);

  const rows = readRows_(SHEET_USERS);
  let maxId = 0;
  rows.forEach(function (row) {
    const value = parseInt(String(row.id), 10);
    if (!isNaN(value) && value > maxId) maxId = value;
  });
  const salt = newSalt_();
  const record = {
    id: ('0' + (maxId + 1)).slice(-2),
    name: String(name || '').trim() || clean,
    account: clean,
    role: role === 'admin' ? 'admin' : 'front',
    active: true,
    pwHash: hashPassword_(password, salt),
    pwSalt: salt,
    createdAt: nowIso_(),
    lastLoginAt: '',
  };
  appendRow_(SHEET_USERS, record);
  return publicUser_(record);
}

function purgeExpiredSessions_() {
  const target = sheet_(SHEET_SESSIONS);
  const rows = readRows_(SHEET_SESSIONS);
  const now = new Date().getTime();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const expiry = new Date(rows[i].expiresAt).getTime();
    if (!expiry || expiry < now) target.deleteRow(rows[i]._row);
  }
}

function requireSession_(token) {
  if (!token) throw fail_('unauthorized', '請先登入');
  const rows = readRows_(SHEET_SESSIONS);
  let match = null;
  for (let i = 0; i < rows.length; i += 1) {
    if (safeEqual_(rows[i].token, token)) { match = rows[i]; break; }
  }
  if (!match) throw fail_('unauthorized', '登入已失效，請重新登入');
  if (new Date(match.expiresAt).getTime() < new Date().getTime()) {
    sheet_(SHEET_SESSIONS).deleteRow(match._row);
    throw fail_('unauthorized', '登入逾時，請重新登入');
  }
  const user = findUserByAccount_(match.account);
  if (!user) throw fail_('unauthorized', '帳號不存在，請重新登入');
  const info = publicUser_(user);
  if (!info.active) throw fail_('disabled', '此帳號已停用，請洽管理員');
  info._row = user._row;
  return info;
}

function requireAdmin_(user) {
  if (user.role !== 'admin') throw fail_('forbidden', '此操作僅限後台管理帳號');
}

/* ------------------------------------------------------------------ */
/* 動作                                                                */
/* ------------------------------------------------------------------ */

function actionLogin_(payload) {
  const account = String(payload.account || '').trim();
  const password = String(payload.password || '');
  if (!account || !password) throw fail_('bad_login', '請輸入帳號與密碼');

  const user = findUserByAccount_(account);
  // 帳號不存在時仍執行一次雜湊，讓失敗耗時一致
  const salt = user ? String(user.pwSalt) : 'nonexistent-account-salt';
  const attempt = hashPassword_(password, salt);
  if (!user || !safeEqual_(attempt, String(user.pwHash))) {
    writeLog_(account, '登入失敗', '');
    throw fail_('bad_login', '帳號或密碼不正確');
  }
  const info = publicUser_(user);
  if (!info.active) throw fail_('disabled', '此帳號已停用，請洽管理員');

  return withLock_(function () {
    purgeExpiredSessions_();
    const token = newToken_();
    const expiresAt = new Date(new Date().getTime() + SESSION_HOURS * 3600 * 1000);
    appendRow_(SHEET_SESSIONS, {
      token: token,
      account: info.account,
      expiresAt: Utilities.formatDate(expiresAt, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss"),
    });
    updateCell_(SHEET_USERS, user._row, 'lastLoginAt', nowIso_());
    writeLog_(info.account, '登入成功', info.role);
    return { token: token, user: info };
  });
}

function actionLogout_(token, user) {
  return withLock_(function () {
    const rows = readRows_(SHEET_SESSIONS);
    for (let i = 0; i < rows.length; i += 1) {
      if (safeEqual_(rows[i].token, token)) {
        sheet_(SHEET_SESSIONS).deleteRow(rows[i]._row);
        break;
      }
    }
    writeLog_(user.account, '登出', '');
    return { ok: true };
  });
}

function actionState_(user) {
  const isAdmin = user.role === 'admin';
  const reports = readRows_(SHEET_REPORTS)
    .filter(function (row) {
      return isAdmin || String(row['帳號']) === user.account;
    })
    .map(rowToReport_)
    .sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });

  const source = readSource_();
  const payload = {
    currentUser: user,
    reports: reports,
    source: source.source,
    sourceName: source.sourceName,
    users: [],
  };
  if (isAdmin) {
    payload.users = readRows_(SHEET_USERS).map(publicUser_);
  }
  return payload;
}

function rowToReport_(row) {
  return {
    id: String(row.id),
    date: formatDateCell_(row['日期']),
    reporter: String(row['填表人']),
    reporterId: String(row['帳號']),
    account: String(row['帳號']),
    floor: String(row['樓層']),
    work: String(row['工項']),
    workers: Number(row['出工人數']) || 0,
    note: String(row['備註'] || ''),
    createdAt: String(row['建立時間'] || ''),
    items: parseJson_(row.itemsJson, []),
    locations: parseJson_(row.locationsJson, []),
    materials: parseJson_(row.materialsJson, []),
  };
}

function formatDateCell_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(value || '');
}

function parseJson_(text, fallback) {
  try {
    const parsed = JSON.parse(String(text || ''));
    return parsed === null ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

function actionAddReport_(user, payload) {
  const report = payload.report || {};
  const date = String(report.date || '').trim();
  const floor = String(report.floor || '').trim();
  const work = String(report.work || '').trim();
  const workers = Number(report.workers);
  if (!date) throw fail_('bad_report', '缺少施工日期');
  if (!floor) throw fail_('bad_report', '缺少樓層');
  if (!work) throw fail_('bad_report', '缺少工項');
  if (!(workers >= 0.5)) throw fail_('bad_report', '出工人數須至少 0.5');

  const items = Array.isArray(report.items) ? report.items : [];
  const locations = Array.isArray(report.locations) ? report.locations : [];
  const materials = Array.isArray(report.materials) ? report.materials : [];
  if (!items.length) throw fail_('bad_report', '缺少施作區域');

  return withLock_(function () {
    const record = {
      id: Utilities.getUuid(),
      日期: date,
      // 填表人以登入帳號的姓名為準，前端不可偽造
      填表人: user.name,
      帳號: user.account,
      樓層: floor,
      工項: work,
      房號空間: describeItems_(items),
      出工人數: workers,
      材料用量: describeMaterials_(materials),
      備註: String(report.note || ''),
      建立時間: nowIso_(),
      itemsJson: JSON.stringify(items),
      locationsJson: JSON.stringify(locations),
      materialsJson: JSON.stringify(materials),
    };
    appendRow_(SHEET_REPORTS, record);
    writeLog_(user.account, '新增回報', date + ' ' + floor + 'F ' + work);
    return { report: rowToReport_(record) };
  });
}

function describeItems_(items) {
  return items.map(function (item) {
    const spaces = (item.spaces || []).map(function (space) {
      return typeof space === 'string' ? space : (space.label || space.code || '');
    }).join('、');
    return item.room + '（' + spaces + '）';
  }).join('；');
}

function describeMaterials_(materials) {
  if (!materials.length) return '';
  return materials.map(function (item) {
    return item.name + ' ' + item.qty + (item.unit || '');
  }).join('、');
}

function actionDeleteReport_(user, payload) {
  requireAdmin_(user);
  const id = String(payload.id || '');
  if (!id) throw fail_('bad_request', '缺少回報編號');
  return withLock_(function () {
    const rows = readRows_(SHEET_REPORTS);
    for (let i = 0; i < rows.length; i += 1) {
      if (String(rows[i].id) === id) {
        sheet_(SHEET_REPORTS).deleteRow(rows[i]._row);
        writeLog_(user.account, '刪除回報', id);
        return { ok: true };
      }
    }
    throw fail_('not_found', '找不到這筆回報');
  });
}

/* ----- 數量明細：JSON 分段存放，繞過單格 50000 字元上限 ----- */

function readSource_() {
  const rows = readRows_(SHEET_SOURCE);
  const chunks = rows
    .filter(function (row) { return String(row.key) === 'sourceJson'; })
    .sort(function (a, b) { return Number(a.seq) - Number(b.seq); })
    .map(function (row) { return String(row.value); });
  const nameRow = rows.filter(function (row) { return String(row.key) === 'sourceName'; })[0];
  return {
    source: parseJson_(chunks.join(''), []),
    sourceName: nameRow ? String(nameRow.value) : '',
  };
}

function actionSetSource_(user, payload) {
  requireAdmin_(user);
  const source = Array.isArray(payload.source) ? payload.source : [];
  const sourceName = String(payload.sourceName || '');
  const text = JSON.stringify(source);

  return withLock_(function () {
    const target = sheet_(SHEET_SOURCE);
    const last = target.getLastRow();
    if (last > 1) target.deleteRows(2, last - 1);

    const rows = [['sourceName', 0, sourceName], ['updatedAt', 0, nowIso_()]];
    for (let i = 0; i * SOURCE_CHUNK_SIZE < text.length; i += 1) {
      rows.push(['sourceJson', i, text.substr(i * SOURCE_CHUNK_SIZE, SOURCE_CHUNK_SIZE)]);
    }
    target.getRange(2, 1, rows.length, 3).setValues(rows);
    writeLog_(user.account, '匯入數量明細', sourceName + '（' + source.length + ' 筆）');
    return { sourceRows: source.length };
  });
}

/* ----- 帳號管理 ----- */

function actionChangePassword_(user, payload) {
  const oldPassword = String(payload.oldPassword || '');
  const newPassword = String(payload.newPassword || '');
  if (newPassword.length < 6) throw fail_('bad_password', '新密碼至少 6 碼');

  const row = findUserByAccount_(user.account);
  if (!safeEqual_(hashPassword_(oldPassword, String(row.pwSalt)), String(row.pwHash))) {
    throw fail_('bad_login', '原密碼不正確');
  }
  return withLock_(function () {
    const salt = newSalt_();
    updateCell_(SHEET_USERS, row._row, 'pwSalt', salt);
    updateCell_(SHEET_USERS, row._row, 'pwHash', hashPassword_(newPassword, salt));
    writeLog_(user.account, '修改密碼', '');
    return { ok: true };
  });
}

function actionAddUser_(user, payload) {
  requireAdmin_(user);
  return withLock_(function () {
    const created = createUser_(payload.name, payload.account, payload.password, payload.role);
    writeLog_(user.account, '建立帳號', created.account + '（' + created.role + '）');
    return { user: created };
  });
}

function actionSetUserRole_(user, payload) {
  requireAdmin_(user);
  const account = String(payload.account || '');
  const role = payload.role === 'admin' ? 'admin' : 'front';
  const row = findUserByAccount_(account);
  if (!row) throw fail_('not_found', '找不到此帳號');
  if (String(row.account) === String(user.account) && role !== 'admin') {
    throw fail_('forbidden', '不能取消自己的管理權限');
  }
  return withLock_(function () {
    updateCell_(SHEET_USERS, row._row, 'role', role);
    writeLog_(user.account, '調整權限', account + ' → ' + role);
    return { user: publicUser_(findUserByAccount_(account)) };
  });
}

function actionSetUserActive_(user, payload) {
  requireAdmin_(user);
  const account = String(payload.account || '');
  const active = payload.active === true;
  const row = findUserByAccount_(account);
  if (!row) throw fail_('not_found', '找不到此帳號');
  if (String(row.account) === String(user.account) && !active) {
    throw fail_('forbidden', '不能停用自己的帳號');
  }
  return withLock_(function () {
    updateCell_(SHEET_USERS, row._row, 'active', active);
    if (!active) {
      // 停用即時生效：清掉該帳號所有登入工作階段
      const sessions = readRows_(SHEET_SESSIONS);
      for (let i = sessions.length - 1; i >= 0; i -= 1) {
        if (String(sessions[i].account) === String(row.account)) {
          sheet_(SHEET_SESSIONS).deleteRow(sessions[i]._row);
        }
      }
    }
    writeLog_(user.account, active ? '啟用帳號' : '停用帳號', account);
    return { user: publicUser_(findUserByAccount_(account)) };
  });
}

function actionResetPassword_(user, payload) {
  requireAdmin_(user);
  const account = String(payload.account || '');
  const password = String(payload.password || '');
  if (password.length < 6) throw fail_('bad_password', '密碼至少 6 碼');
  const row = findUserByAccount_(account);
  if (!row) throw fail_('not_found', '找不到此帳號');
  return withLock_(function () {
    const salt = newSalt_();
    updateCell_(SHEET_USERS, row._row, 'pwSalt', salt);
    updateCell_(SHEET_USERS, row._row, 'pwHash', hashPassword_(password, salt));
    const sessions = readRows_(SHEET_SESSIONS);
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      if (String(sessions[i].account) === String(row.account)) {
        sheet_(SHEET_SESSIONS).deleteRow(sessions[i]._row);
      }
    }
    writeLog_(user.account, '重設密碼', account);
    return { ok: true };
  });
}
