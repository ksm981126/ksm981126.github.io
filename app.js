const STORAGE_KEY = "salary-calendar-v4";
const OLD_KEYS = ["salary-calendar-v3", "salary-calendar-v2", "salary-calendar-v1"];
const GOOGLE_CLIENT_ID = "583902313340-iphddiep3ami3h3ugsef7de5l7v9p9c9.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE_NAME = "salary-calendar-data.json";
const DRIVE_META_KEY = "salary-calendar-drive-meta";
const DRIVE_TOKEN_KEY = "salary-calendar-drive-token";
const LOCK_AUTH_KEY = "salary-calendar-password-auth";
const fmtMoney = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const today = new Date();

let state = loadState();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDateKey = "";
let appMode = "salary";
let tokenClient = null;
let accessToken = loadStoredDriveToken();
let autoSaveTimer = null;
let isApplyingRemoteState = false;
let driveMeta = loadDriveMeta();

const els = {
  settingsPanel: document.querySelector("#settingsPanel"),
  menuScrim: document.querySelector("#menuScrim"),
  openSettings: document.querySelector("#openSettings"),
  closeSettings: document.querySelector("#closeSettings"),
  form: document.querySelector("#settingsForm"),
  hourlyWage: document.querySelector("#hourlyWage"),
  defaultStart: document.querySelector("#defaultStart"),
  defaultEnd: document.querySelector("#defaultEnd"),
  breakHours: document.querySelector("#breakHours"),
  nightStart: document.querySelector("#nightStart"),
  nightEnd: document.querySelector("#nightEnd"),
  payday: document.querySelector("#payday"),
  hireDate: document.querySelector("#hireDate"),
  businessSize: document.querySelector("#businessSize"),
  weeklyAllowance: document.querySelector("#weeklyAllowance"),
  useDeductions: document.querySelector("#useDeductions"),
  taxFreeMonthly: document.querySelector("#taxFreeMonthly"),
  dependents: document.querySelector("#dependents"),
  monthLabel: document.querySelector("#monthLabel"),
  calendar: document.querySelector("#calendar"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  todayBtn: document.querySelector("#todayBtn"),
  salaryCalendarBtn: document.querySelector("#salaryCalendarBtn"),
  journalCalendarBtn: document.querySelector("#journalCalendarBtn"),
  salaryQueryBtn: document.querySelector("#salaryQueryBtn"),
  summaryPanel: document.querySelector(".summary"),
  grossLabel: document.querySelector("#grossLabel"),
  netLabel: document.querySelector("#netLabel"),
  grossPay: document.querySelector("#grossPay"),
  netPay: document.querySelector("#netPay"),
  workedDays: document.querySelector("#workedDays"),
  leaveDays: document.querySelector("#leaveDays"),
  deductionBreakdown: document.querySelector("#deductionBreakdown"),
  dialog: document.querySelector("#dayDialog"),
  dayForm: document.querySelector("#dayForm"),
  dialogDate: document.querySelector("#dialogDate"),
  dayWage: document.querySelector("#dayWage"),
  dayStart: document.querySelector("#dayStart"),
  dayEnd: document.querySelector("#dayEnd"),
  dayBreak: document.querySelector("#dayBreak"),
  dayType: document.querySelector("#dayType"),
  vacationDay: document.querySelector("#vacationDay"),
  deleteDay: document.querySelector("#deleteDay"),
  exportData: document.querySelector("#exportData"),
  importData: document.querySelector("#importData"),
  driveConnect: document.querySelector("#driveConnect"),
  driveLoad: document.querySelector("#driveLoad"),
  driveSave: document.querySelector("#driveSave"),
  driveAutoSync: document.querySelector("#driveAutoSync"),
  driveStatus: document.querySelector("#driveStatus"),
  salaryDialog: document.querySelector("#salaryDialog"),
  queryYear: document.querySelector("#queryYear"),
  queryMonth: document.querySelector("#queryMonth"),
  queryOne: document.querySelector("#queryOne"),
  queryAll: document.querySelector("#queryAll"),
  salaryResult: document.querySelector("#salaryResult"),
  salaryGraph: document.querySelector("#salaryGraph"),
  journalDialog: document.querySelector("#journalDialog"),
  journalForm: document.querySelector("#journalForm"),
  journalDate: document.querySelector("#journalDate"),
  journalEntries: document.querySelector("#journalEntries"),
  addJournalEntry: document.querySelector("#addJournalEntry"),
  deleteJournal: document.querySelector("#deleteJournal")
};

const lockEls = createPasswordUi();

function createPasswordUi() {
  document.body.insertAdjacentHTML("afterbegin", `
    <section class="lock-screen" id="lockScreen" aria-label="비밀번호 잠금">
      <form class="lock-card" id="lockForm">
        <p class="eyebrow">PRIVATE PAYROLL</p>
        <h2 id="lockTitle">급여달력 잠금</h2>
        <p class="lock-copy" id="lockCopy">비밀번호를 입력하면 급여달력을 볼 수 있습니다.</p>
        <label>비밀번호<input type="password" id="lockPassword" autocomplete="current-password" minlength="4"></label>
        <button type="submit" class="primary-btn" id="lockSubmit">열기</button>
        <p class="lock-message" id="lockMessage"></p>
      </form>
    </section>
  `);
  document.querySelector(".sync-tools")?.insertAdjacentHTML("afterend", `
    <div class="password-tools">
      <h2>앱 잠금</h2>
      <label>새 비밀번호<input type="password" id="newPassword" autocomplete="new-password" minlength="4" placeholder="4자리 이상"></label>
      <label>비밀번호 확인<input type="password" id="confirmPassword" autocomplete="new-password" minlength="4"></label>
      <div class="password-actions">
        <button id="savePassword" type="button" class="primary-btn">비밀번호 저장</button>
        <button id="lockNow" type="button" class="ghost-btn">지금 잠그기</button>
      </div>
      <p class="sync-status" id="passwordStatus">한 번 인증한 기기는 다음부터 바로 열립니다.</p>
    </div>
  `);
  return {
    screen: document.querySelector("#lockScreen"),
    form: document.querySelector("#lockForm"),
    title: document.querySelector("#lockTitle"),
    copy: document.querySelector("#lockCopy"),
    password: document.querySelector("#lockPassword"),
    submit: document.querySelector("#lockSubmit"),
    message: document.querySelector("#lockMessage"),
    newPassword: document.querySelector("#newPassword"),
    confirmPassword: document.querySelector("#confirmPassword"),
    savePassword: document.querySelector("#savePassword"),
    lockNow: document.querySelector("#lockNow"),
    passwordStatus: document.querySelector("#passwordStatus")
  };
}

function randomSalt() {
  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function passwordHash(password, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function isDeviceTrusted() {
  return Boolean(state.settings.passwordHash && localStorage.getItem(LOCK_AUTH_KEY) === state.settings.passwordHash);
}

function rememberTrustedDevice() {
  if (state.settings.passwordHash) localStorage.setItem(LOCK_AUTH_KEY, state.settings.passwordHash);
}

function forgetTrustedDevice() {
  localStorage.removeItem(LOCK_AUTH_KEY);
}

function applyLockScreen() {
  const hasPassword = Boolean(state.settings.passwordHash);
  const unlocked = hasPassword && isDeviceTrusted();
  document.body.classList.toggle("locked", !unlocked);
  lockEls.screen.classList.toggle("show", !unlocked);
  lockEls.title.textContent = hasPassword ? "급여달력 잠금" : "비밀번호 설정";
  lockEls.copy.textContent = hasPassword
    ? "비밀번호를 입력하면 급여달력을 볼 수 있습니다."
    : "처음 사용할 비밀번호를 정해주세요. 4자리 이상이면 됩니다.";
  lockEls.submit.textContent = hasPassword ? "열기" : "비밀번호 설정";
  lockEls.password.value = "";
  lockEls.password.focus();
}

async function setAppPassword(password) {
  const salt = randomSalt();
  state.settings.passwordSalt = salt;
  state.settings.passwordHash = await passwordHash(password, salt);
  saveState();
  rememberTrustedDevice();
  applyLockScreen();
}

async function unlockApp(password) {
  const hash = await passwordHash(password, state.settings.passwordSalt || "");
  if (hash !== state.settings.passwordHash) {
    lockEls.message.textContent = "비밀번호가 맞지 않습니다.";
    return;
  }
  rememberTrustedDevice();
  lockEls.message.textContent = "";
  applyLockScreen();
}

function defaultState() {
  return {
    updatedAt: new Date().toISOString(),
    settings: {
      hourlyWage: 10030,
      defaultStart: "09:00",
      defaultEnd: "18:00",
      breakHours: 1,
      nightStart: "22:00",
      nightEnd: "06:00",
      payday: 20,
      hireDate: dateKey(today),
      businessSize: "over5",
      weeklyAllowance: "auto",
      useDeductions: true,
      taxFreeMonthly: 200000,
      dependents: 1,
      passwordHash: "",
      passwordSalt: ""
    },
    days: {},
    journals: {}
  };
}

function normalizeState(raw) {
  const base = defaultState();
  const settings = { ...base.settings, ...(raw?.settings || {}) };
  const days = {};
  Object.entries(raw?.days || {}).forEach(([key, record]) => {
    days[key] = normalizeRecord(record, settings);
  });
  const journals = {};
  Object.entries(raw?.journals || {}).forEach(([key, entries]) => {
    journals[key] = normalizeJournalEntries(entries);
  });
  return { updatedAt: raw?.updatedAt || new Date().toISOString(), settings, days, journals };
}

function normalizeJournalEntries(entries) {
  return (Array.isArray(entries) ? entries : []).map((entry) => ({
    siteName: String(entry?.siteName || ""),
    period: String(entry?.period || ""),
    tasks: Array.isArray(entry?.tasks) ? entry.tasks.filter(Boolean) : [],
    office: Boolean(entry?.office)
  })).filter((entry) => entry.office || entry.siteName || entry.period || entry.tasks.length);
}

function normalizeRecord(record, settings = defaultState().settings) {
  if (record?.type === "vacation") {
    return { type: "vacation", worked: false, wage: Number(record.wage || settings.hourlyWage) };
  }
  const start = record?.start || settings.defaultStart;
  let end = record?.end || settings.defaultEnd;
  if (!record?.end && record?.hours) {
    end = minutesToTime(timeToMinutes(start) + Number(record.hours) * 60 + Number(record.breakHours || 0) * 60);
  }
  return {
    worked: record?.worked !== false,
    wage: Number(record?.wage || settings.hourlyWage),
    start,
    end,
    breakHours: Number(record?.breakHours ?? settings.breakHours),
    type: record?.type || "normal"
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || OLD_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    return saved ? normalizeState(JSON.parse(saved)) : defaultState();
  } catch {
    return defaultState();
  }
}

function saveState() {
  if (!isApplyingRemoteState) state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleDriveAutoSave();
}

function loadDriveMeta() {
  try {
    return JSON.parse(localStorage.getItem(DRIVE_META_KEY)) || { fileId: "", autoSync: false, lastSync: "" };
  } catch {
    return { fileId: "", autoSync: false, lastSync: "" };
  }
}

function saveDriveMeta() {
  localStorage.setItem(DRIVE_META_KEY, JSON.stringify(driveMeta));
}

function loadStoredDriveToken() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRIVE_TOKEN_KEY) || "{}");
    if (saved.accessToken && saved.expiresAt && Number(saved.expiresAt) > Date.now() + 120000) {
      return saved.accessToken;
    }
  } catch {}
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  return "";
}

function rememberDriveToken(token, expiresIn = 3600) {
  accessToken = token;
  localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({
    accessToken: token,
    expiresAt: Date.now() + Math.max(60, Number(expiresIn || 3600) - 120) * 1000
  }));
  updateDriveControls();
}

function clearDriveToken() {
  accessToken = "";
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  updateDriveControls();
}

function setDriveStatus(message) {
  if (els.driveStatus) els.driveStatus.textContent = message;
}

function updateDriveControls() {
  if (!els.driveAutoSync) return;
  els.driveAutoSync.checked = Boolean(driveMeta.autoSync);
  const connected = Boolean(accessToken);
  if (els.driveConnect) els.driveConnect.textContent = connected ? "Google Drive 연결됨" : "Google Drive 연결";
}

function waitForGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
      } else if (tries > 60) {
        clearInterval(timer);
        reject(new Error("Google 로그인 스크립트를 불러오지 못했습니다."));
      }
    }, 100);
  });
}

async function ensureDriveToken(prompt = "", options = {}) {
  if (accessToken) return accessToken;
  const allowPopup = options.allowPopup !== false;
  if (!allowPopup) {
    throw new Error("Google Drive 연결을 먼저 눌러주세요. 한 번 연결하면 만료 전까지 저장/불러오기는 자동으로 됩니다.");
  }
  await waitForGoogleIdentity();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      prompt,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        rememberDriveToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      }
    });
    tokenClient.requestAccessToken({ prompt });
  });
}

async function driveFetch(url, options = {}) {
  const token = await ensureDriveToken("", { allowPopup: false });
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  if (response.status === 401) {
    clearDriveToken();
    throw new Error("Google Drive 인증 시간이 만료됐습니다. Google Drive 연결을 한 번 다시 눌러주세요.");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Drive 요청 실패: ${response.status}`);
  }
  return response;
}

async function findDriveFile() {
  const query = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)&pageSize=10`;
  const response = await driveFetch(url);
  const data = await response.json();
  const file = data.files?.[0];
  if (file?.id) {
    driveMeta.fileId = file.id;
    driveMeta.lastRemoteModified = file.modifiedTime || "";
    saveDriveMeta();
    return file.id;
  }
  driveMeta.fileId = "";
  driveMeta.lastRemoteModified = "";
  saveDriveMeta();
  return "";
}

async function createDriveFile() {
  const metadata = { name: DRIVE_FILE_NAME, mimeType: "application/json" };
  const boundary = "salary_calendar_boundary";
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(state, null, 2),
    `--${boundary}--`
  ].join("\r\n");
  const response = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  const data = await response.json();
  driveMeta.fileId = data.id;
  driveMeta.lastSync = new Date().toISOString();
  driveMeta.lastRemoteModified = data.modifiedTime || "";
  saveDriveMeta();
  return data.id;
}

async function getDriveFileId() {
  return (await findDriveFile()) || (await createDriveFile());
}

async function loadFromDrive(options = {}) {
  setDriveStatus("Drive에서 불러오는 중...");
  const fileId = await getDriveFileId();
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  const remote = normalizeState(await response.json());
  const localTime = Date.parse(state.updatedAt || 0);
  const remoteTime = Date.parse(remote.updatedAt || 0);
  if (!options.force && remoteTime < localTime && !confirm("현재 기기 데이터가 Drive보다 최신입니다. 그래도 Drive 데이터로 덮어쓸까요?")) {
    setDriveStatus("Drive 불러오기를 취소했습니다.");
    return;
  }
  isApplyingRemoteState = true;
  state = remote;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  isApplyingRemoteState = false;
  driveMeta.lastSync = new Date().toISOString();
  saveDriveMeta();
  renderSettings();
  renderCalendar();
  applyLockScreen();
  setDriveStatus(`Drive에서 전체 데이터(설정/잠금 포함)를 불러왔습니다. ${new Date().toLocaleTimeString("ko-KR")}`);
}

async function saveToDrive() {
  setDriveStatus("Drive에 저장하는 중...");
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const fileId = await getDriveFileId();
  await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(state, null, 2)
  });
  driveMeta.lastSync = new Date().toISOString();
  saveDriveMeta();
  setDriveStatus(`Drive에 전체 데이터(설정/잠금 포함)를 저장했습니다. ${new Date().toLocaleTimeString("ko-KR")}`);
}

function scheduleDriveAutoSave() {
  if (!driveMeta.autoSync || !accessToken || isApplyingRemoteState) return;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveToDrive().catch((error) => setDriveStatus(`자동 저장 실패: ${error.message}`));
  }, 1500);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key) {
  return new Date(`${key}T00:00:00`);
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function timeToMinutes(value) {
  const [h, m] = String(value || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function timeRangeHours(start, end, breakHours = 0) {
  let startMin = timeToMinutes(start);
  let endMin = timeToMinutes(end);
  if (endMin <= startMin) endMin += 1440;
  return Math.max(0, (endMin - startMin) / 60 - Number(breakHours || 0));
}

function overlapHours(startA, endA, startB, endB) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB)) / 60;
}

function nightHours(record) {
  if (!record?.worked) return 0;
  let start = timeToMinutes(record.start);
  let end = timeToMinutes(record.end);
  if (end <= start) end += 1440;
  const nightStart = timeToMinutes(state.settings.nightStart);
  let nightEnd = timeToMinutes(state.settings.nightEnd);
  if (nightEnd <= nightStart) nightEnd += 1440;
  let total = 0;
  for (const offset of [-1440, 0, 1440]) {
    total += overlapHours(start, end, nightStart + offset, nightEnd + offset);
  }
  return Math.min(total, workHours(record));
}

function workHours(record) {
  if (!record?.worked) return 0;
  return timeRangeHours(record.start, record.end, record.breakHours);
}

function paidDayHours() {
  return timeRangeHours(state.settings.defaultStart, state.settings.defaultEnd, state.settings.breakHours);
}

function rawHolidayEntries(year) {
  const fixed = [
    ["01-01", "신정", "none"],
    ["03-01", "삼일절", "weekend"],
    ["05-05", "어린이날", "weekend"],
    ["06-06", "현충일", "none"],
    ["08-15", "광복절", "weekend"],
    ["10-03", "개천절", "weekend"],
    ["10-09", "한글날", "weekend"],
    ["12-25", "성탄절", "weekend"]
  ];
  const lunar = {
    2026: [["02-16", "설날"], ["02-17", "설날"], ["02-18", "설날"], ["05-24", "부처님오신날"], ["09-24", "추석"], ["09-25", "추석"], ["09-26", "추석"]],
    2027: [["02-06", "설날"], ["02-07", "설날"], ["02-08", "설날"], ["05-13", "부처님오신날"], ["09-14", "추석"], ["09-15", "추석"], ["09-16", "추석"]],
    2028: [["01-26", "설날"], ["01-27", "설날"], ["01-28", "설날"], ["05-02", "부처님오신날"], ["10-02", "추석"], ["10-03", "추석"], ["10-04", "추석"]],
    2029: [["02-12", "설날"], ["02-13", "설날"], ["02-14", "설날"], ["05-20", "부처님오신날"], ["09-21", "추석"], ["09-22", "추석"], ["09-23", "추석"]],
    2030: [["02-02", "설날"], ["02-03", "설날"], ["02-04", "설날"], ["05-09", "부처님오신날"], ["09-11", "추석"], ["09-12", "추석"], ["09-13", "추석"]]
  };
  const lunarEntries = (lunar[year] || []).map(([md, name]) => [md, name, name === "부처님오신날" ? "weekend" : "sunday"]);
  return [...fixed, ...lunarEntries].map(([md, name, substituteRule]) => ({
    key: `${year}-${md}`,
    name,
    substitute: false,
    substituteRule
  }));
}

function holidaysForYear(year) {
  const entries = rawHolidayEntries(year);
  const byDate = new Map();
  entries.forEach((item) => {
    const items = byDate.get(item.key) || [];
    items.push(item);
    byDate.set(item.key, items);
  });

  const map = new Map();
  byDate.forEach((items, key) => {
    map.set(key, {
      key,
      name: [...new Set(items.map((item) => item.name))].join(" / "),
      substitute: false,
      substituteRule: items.find((item) => item.substituteRule !== "none")?.substituteRule || "none"
    });
  });

  byDate.forEach((items, key) => {
    const eligibleItems = items.filter((item) => item.substituteRule !== "none");
    if (!eligibleItems.length) return;
    const date = dateFromKey(key);
    const hasWeekendRule = eligibleItems.some((item) => item.substituteRule === "weekend");
    const hasSundayRule = eligibleItems.some((item) => item.substituteRule === "sunday");
    const overlapsAnotherHoliday = items.length > 1;
    const needsSubstitute = (hasWeekendRule && (date.getDay() === 0 || date.getDay() === 6)) || (hasSundayRule && date.getDay() === 0) || overlapsAnotherHoliday;
    if (!needsSubstitute) return;
    let substitute = addDays(date, 1);
    while (substitute.getDay() === 0 || substitute.getDay() === 6 || map.has(dateKey(substitute))) {
      substitute = addDays(substitute, 1);
    }
    const subKey = dateKey(substitute);
    const subName = [...new Set(eligibleItems.map((item) => item.name))].join(" / ");
    map.set(subKey, { key: subKey, name: `${subName} 대체공휴일`, substitute: true, substituteRule: "none" });
  });
  return map;
}

function holidayInfo(date) {
  return holidaysForYear(date.getFullYear()).get(dateKey(date)) || null;
}

function isHoliday(date) {
  return Boolean(holidayInfo(date));
}

function isNonBusinessDay(date) {
  return date.getDay() === 0 || date.getDay() === 6 || isHoliday(date);
}

function isPaidHoliday(date) {
  return state.settings.businessSize === "over5" && date.getDay() >= 1 && date.getDay() <= 5 && isHoliday(date);
}

function isEmployedOn(date) {
  return dateKey(date) >= state.settings.hireDate;
}

function adjustedPayday(year, month) {
  const last = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, Number(state.settings.payday || 1)), last);
  let date = new Date(year, month, day);
  while (isNonBusinessDay(date)) {
    date = addDays(date, -1);
  }
  return dateKey(date);
}

function previousMonth(year, month) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

function baseWorkRecord(date) {
  return {
    worked: true,
    wage: Number(state.settings.hourlyWage),
    start: state.settings.defaultStart,
    end: state.settings.defaultEnd,
    breakHours: Number(state.settings.breakHours),
    type: isHoliday(date) || date.getDay() === 0 ? "holiday" : "normal"
  };
}

function dayPay(record, key) {
  if (!record?.worked) return 0;
  const hours = workHours(record);
  const wage = Number(record.wage || 0);
  const over5 = state.settings.businessSize === "over5";
  const overtime = Math.max(0, hours - 8);
  const night = nightHours(record);
  const date = dateFromKey(key);
  const holidayWork = record.type === "holiday" || isHoliday(date) || date.getDay() === 0;
  const base = hours * wage;
  const overtimeExtra = over5 ? overtime * wage * 0.5 : 0;
  const nightExtra = over5 ? night * wage * 0.5 : 0;
  const holidayExtra = over5 && holidayWork ? hours * wage * 0.5 : 0;
  return Math.round(base + overtimeExtra + nightExtra + holidayExtra);
}

function monthKeys(year, month) {
  const last = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: last }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`);
}

function monthRecords(year, month) {
  return monthKeys(year, month).map((key) => [key, state.days[key]]).filter(([, record]) => record?.worked);
}

function monthVacationRecords(year, month) {
  return monthKeys(year, month).map((key) => [key, state.days[key]]).filter(([, record]) => record?.type === "vacation");
}

function weekKey(date) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - copy.getDay());
  return dateKey(copy);
}

function weeklyAllowanceForMonth(year, month) {
  if (state.settings.weeklyAllowance !== "auto") return 0;
  const weeks = new Map();
  monthRecords(year, month).forEach(([key, record]) => {
    const date = dateFromKey(key);
    const bucket = weekKey(date);
    const item = weeks.get(bucket) || { hours: 0, wageHours: 0 };
    const hours = workHours(record);
    item.hours += hours;
    item.wageHours += hours * Number(record.wage || 0);
    weeks.set(bucket, item);
  });
  let total = 0;
  weeks.forEach((item) => {
    if (item.hours >= 15) {
      const avgWage = item.hours ? item.wageHours / item.hours : Number(state.settings.hourlyWage);
      total += Math.min(8, item.hours / 5) * avgWage;
    }
  });
  return Math.round(total);
}

function paidHolidayAllowanceForMonth(year, month) {
  return monthKeys(year, month).reduce((sum, key) => {
    const date = dateFromKey(key);
    if (!isPaidHoliday(date) || !isEmployedOn(date)) return sum;
    return sum + paidDayHours() * Number(state.settings.hourlyWage || 0);
  }, 0);
}

function vacationPayForMonth(year, month) {
  return monthVacationRecords(year, month).reduce((sum, [, record]) => sum + paidDayHours() * Number(record.wage || state.settings.hourlyWage || 0), 0);
}

function payrollForWorkMonth(year, month) {
  const workPay = monthRecords(year, month).reduce((sum, [key, record]) => sum + dayPay(record, key), 0);
  const weekly = weeklyAllowanceForMonth(year, month);
  const paidHoliday = Math.round(paidHolidayAllowanceForMonth(year, month));
  const vacation = Math.round(vacationPayForMonth(year, month));
  const gross = Math.round(workPay + weekly + paidHoliday + vacation);
  const deductions = estimateDeductions(gross);
  return { workPay, weekly, paidHoliday, vacation, gross, deductions, net: Math.max(0, gross - deductions.total) };
}

function payrollReceivedIn(year, month) {
  const period = previousMonth(year, month);
  return { period, payday: adjustedPayday(year, month), ...payrollForWorkMonth(period.year, period.month) };
}

function earnedIncomeDeduction(annualPay) {
  if (annualPay <= 5000000) return annualPay * 0.7;
  if (annualPay <= 15000000) return 3500000 + (annualPay - 5000000) * 0.4;
  if (annualPay <= 45000000) return 7500000 + (annualPay - 15000000) * 0.15;
  if (annualPay <= 100000000) return 12000000 + (annualPay - 45000000) * 0.05;
  return 14750000 + (annualPay - 100000000) * 0.02;
}

function progressiveIncomeTax(taxBase) {
  const base = Math.max(0, taxBase);
  if (base <= 14000000) return base * 0.06;
  if (base <= 50000000) return base * 0.15 - 1260000;
  if (base <= 88000000) return base * 0.24 - 5760000;
  if (base <= 150000000) return base * 0.35 - 15440000;
  if (base <= 300000000) return base * 0.38 - 19940000;
  if (base <= 500000000) return base * 0.40 - 25940000;
  if (base <= 1000000000) return base * 0.42 - 35940000;
  return base * 0.45 - 65940000;
}

function estimateDeductions(grossMonthly) {
  if (!state.settings.useDeductions || grossMonthly <= 0) {
    return { pension: 0, health: 0, care: 0, employment: 0, incomeTax: 0, localTax: 0, total: 0 };
  }
  const taxableMonthly = Math.max(0, grossMonthly - Number(state.settings.taxFreeMonthly || 0));
  const pensionBase = Math.min(6370000, Math.max(400000, taxableMonthly));
  const pension = Math.round(pensionBase * 0.045);
  const health = Math.round(taxableMonthly * 0.03545);
  const care = Math.round(health * 0.1295);
  const employment = Math.round(taxableMonthly * 0.009);
  const annualTaxablePay = taxableMonthly * 12;
  const annualSocial = (pension + health + care + employment) * 12;
  const personalDeduction = Math.max(1, Number(state.settings.dependents || 1)) * 1500000;
  const taxBase = annualTaxablePay - earnedIncomeDeduction(annualTaxablePay) - annualSocial - personalDeduction;
  const annualIncomeTaxBeforeCredit = progressiveIncomeTax(taxBase);
  const earnedIncomeTaxCredit = Math.min(740000, annualIncomeTaxBeforeCredit * 0.55);
  const incomeTax = Math.round(Math.max(0, annualIncomeTaxBeforeCredit - earnedIncomeTaxCredit) / 12);
  const localTax = Math.round(incomeTax * 0.1);
  const total = pension + health + care + employment + incomeTax + localTax;
  return { pension, health, care, employment, incomeTax, localTax, total };
}

function completedMonths(fromKey, toDate) {
  const from = dateFromKey(fromKey);
  let months = (toDate.getFullYear() - from.getFullYear()) * 12 + toDate.getMonth() - from.getMonth();
  if (toDate.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function completedYears(fromKey, toDate) {
  const from = dateFromKey(fromKey);
  let years = toDate.getFullYear() - from.getFullYear();
  if (toDate.getMonth() < from.getMonth() || (toDate.getMonth() === from.getMonth() && toDate.getDate() < from.getDate())) years -= 1;
  return Math.max(0, years);
}

function addMonthsClamped(date, months) {
  const copy = new Date(date);
  const originalDay = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(originalDay, lastDay));
  return copy;
}

function keyInRange(key, startDate, endDate) {
  const startKey = dateKey(startDate);
  const endKey = dateKey(endDate);
  return key >= startKey && key < endKey;
}

function isAttendanceCredit(key, record) {
  if (record?.worked || record?.type === "vacation") return true;
  const date = dateFromKey(key);
  return isPaidHoliday(date) && isEmployedOn(date);
}

function attendanceCreditsInRange(startDate, endDate) {
  const recorded = Object.entries(state.days).filter(([key, record]) => keyInRange(key, startDate, endDate) && isAttendanceCredit(key, record)).length;
  let paidHolidays = 0;
  for (let date = new Date(startDate); date < endDate; date = addDays(date, 1)) {
    if (isPaidHoliday(date) && isEmployedOn(date) && !state.days[dateKey(date)]) paidHolidays += 1;
  }
  return recorded + paidHolidays;
}

function expectedWorkdaysInRange(startDate, endDate) {
  let total = 0;
  for (let date = new Date(startDate); date < endDate; date = addDays(date, 1)) {
    if (!isEmployedOn(date)) continue;
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    total += 1;
  }
  return total;
}

function monthlyLeaveEntitlement(asOf = today) {
  const hire = dateFromKey(state.settings.hireDate);
  let earned = 0;
  for (let index = 0; index < 11; index += 1) {
    const start = addMonthsClamped(hire, index);
    const end = addMonthsClamped(hire, index + 1);
    if (end > asOf) break;
    const expected = expectedWorkdaysInRange(start, end);
    const attended = attendanceCreditsInRange(start, end);
    if (expected > 0 && attended >= expected) earned += 1;
  }
  return earned;
}

function annualLeaveEntitlement(asOf = today) {
  const hire = dateFromKey(state.settings.hireDate);
  const years = completedYears(state.settings.hireDate, asOf);
  if (years < 1) return 0;
  const periodStart = addMonthsClamped(hire, (years - 1) * 12);
  const periodEnd = addMonthsClamped(hire, years * 12);
  const expected = expectedWorkdaysInRange(periodStart, periodEnd);
  const attended = attendanceCreditsInRange(periodStart, periodEnd);
  if (expected > 0 && attended / expected < 0.8) return 0;
  return Math.min(25, 15 + Math.floor((years - 1) / 2));
}

function leaveEntitlement(asOf = today) {
  const years = completedYears(state.settings.hireDate, asOf);
  if (years < 1) return monthlyLeaveEntitlement(asOf);
  return annualLeaveEntitlement(asOf);
}

function leaveUsePeriod(asOf = today) {
  const hire = dateFromKey(state.settings.hireDate);
  const years = completedYears(state.settings.hireDate, asOf);
  const start = years < 1 ? hire : addMonthsClamped(hire, years * 12);
  return { start, end: addDays(asOf, 1) };
}

function usedLeaveUntil(asOf = today) {
  const period = leaveUsePeriod(asOf);
  return Object.entries(state.days).filter(([key, record]) => keyInRange(key, period.start, period.end) && record?.type === "vacation").length;
}

function remainingLeave(asOf = today) {
  return Math.max(0, leaveEntitlement(asOf) - usedLeaveUntil(asOf));
}

function weeklyHoursWithCandidate(key, candidateRecord) {
  const targetWeek = weekKey(dateFromKey(key));
  return Object.entries({ ...state.days, [key]: candidateRecord }).reduce((sum, [dayKey, record]) => {
    if (!record?.worked) return sum;
    return weekKey(dateFromKey(dayKey)) === targetWeek ? sum + workHours(record) : sum;
  }, 0);
}

function weeklyHoursForDate(date) {
  const targetWeek = weekKey(date);
  return Object.entries(state.days).reduce((sum, [dayKey, record]) => {
    if (!record?.worked) return sum;
    return weekKey(dateFromKey(dayKey)) === targetWeek ? sum + workHours(record) : sum;
  }, 0);
}

function weeklyOvertimeForDate(date) {
  return Math.max(0, weeklyHoursForDate(date) - 40);
}

function legalWorkWarnings(key, record) {
  if (state.settings.businessSize !== "over5" || !record?.worked) return [];
  const weekHours = weeklyHoursWithCandidate(key, record);
  const overtimeHours = Math.max(0, weekHours - 40);
  const warnings = [];
  if (weekHours > 52) warnings.push(`해당 주 근로시간이 ${weekHours.toFixed(1)}시간입니다. 연장근로가 ${overtimeHours.toFixed(1)}시간으로, 허용 기준인 주 12시간을 초과합니다.`);
  return warnings;
}

function showLegalWorkAlert(key, record) {
  const warnings = legalWorkWarnings(key, record);
  if (warnings.length) alert(`근로시간 확인이 필요합니다.\n\n${warnings.join("\n")}\n\n휴게시간을 뺀 실제 근로시간 기준으로 계산했습니다.`);
}

function renderSettings() {
  els.hourlyWage.value = state.settings.hourlyWage;
  els.defaultStart.value = state.settings.defaultStart;
  els.defaultEnd.value = state.settings.defaultEnd;
  els.breakHours.value = state.settings.breakHours;
  els.nightStart.value = state.settings.nightStart;
  els.nightEnd.value = state.settings.nightEnd;
  els.payday.value = state.settings.payday;
  els.hireDate.value = state.settings.hireDate;
  els.businessSize.value = state.settings.businessSize;
  els.weeklyAllowance.value = state.settings.weeklyAllowance;
  els.useDeductions.checked = state.settings.useDeductions;
  els.taxFreeMonthly.value = state.settings.taxFreeMonthly;
  els.dependents.value = state.settings.dependents;
}

function renderCalendar() {
  const isJournalMode = appMode === "journal";
  els.monthLabel.textContent = `${viewYear}년 ${viewMonth + 1}월${isJournalMode ? " 업무일지" : ""}`;
  els.summaryPanel.hidden = isJournalMode;
  els.deductionBreakdown.hidden = isJournalMode;
  els.salaryQueryBtn.hidden = isJournalMode;
  els.salaryCalendarBtn.classList.toggle("active", !isJournalMode);
  els.journalCalendarBtn.classList.toggle("active", isJournalMode);
  els.calendar.innerHTML = "";
  const first = new Date(viewYear, viewMonth, 1);
  const start = new Date(viewYear, viewMonth, 1 - first.getDay());
  const payKey = adjustedPayday(viewYear, viewMonth);
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    const key = dateKey(date);
    const holiday = holidayInfo(date);
    const paidHoliday = isPaidHoliday(date);
    const isPayday = key === payKey;
    const button = document.createElement("button");
    button.type = "button";
    button.className = ["day", isJournalMode ? "journal-day" : "", dateKey(date) === dateKey(today) ? "today" : "", date.getMonth() !== viewMonth ? "muted" : "", date.getDay() === 0 ? "sun" : "", date.getDay() === 6 ? "sat" : "", holiday ? "holiday" : ""].filter(Boolean).join(" ");
    if (isJournalMode) {
      button.innerHTML = journalDayHtml(date, key, state.journals[key] || [], holiday);
      button.addEventListener("click", () => handleJournalDayClick(date));
    } else {
      const record = state.days[key] || null;
      button.innerHTML = dayHtml(date, key, record, holiday, paidHoliday, isPayday, date.getDay() === 6 ? weeklyOvertimeForDate(date) : null);
      button.addEventListener("click", () => handleDayClick(date));
    }
    els.calendar.appendChild(button);
  }
  if (!isJournalMode) renderSummary();
}

function dayHtml(date, key, record, holiday, paidHoliday, isPayday, weeklyOvertime) {
  const badges = [];
  if (isPayday) badges.push('<span class="badge pay">월급일</span>');
  if (paidHoliday) badges.push('<span class="badge paid">유급휴일</span>');
  if (record?.type === "vacation") badges.push('<span class="badge vac">휴가</span>');
  if (weeklyOvertime !== null) badges.push(`<span class="badge week">주 연장 ${weeklyOvertime.toFixed(1)}h</span>`);
  if (record?.worked) {
    const overtime = Math.max(0, workHours(record) - 8);
    const night = nightHours(record);
    if (overtime > 0) badges.push(`<span class="badge over">연장 ${overtime.toFixed(1)}h</span>`);
    if (night > 0) badges.push(`<span class="badge night">야간 ${night.toFixed(1)}h</span>`);
  }
  const body = record?.worked
    ? `<span class="stamp">출근</span><div class="mini-line">${record.start}-${record.end} · ${fmtMoney.format(record.wage)}/h</div>`
    : record?.type === "vacation"
      ? `<div class="mini-line">유급휴가 · ${fmtMoney.format(record.wage || state.settings.hourlyWage)}/h</div>`
      : "";
  return `
    <div class="date-row"><span class="date">${date.getDate()}</span><span class="holiday-name">${holiday?.name || ""}</span></div>
    <div class="day-body">${body}<div class="badge-row">${badges.join("")}</div></div>
    <div class="day-pay">${record?.worked ? fmtMoney.format(dayPay(record, key)) : ""}</div>
  `;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function journalDayHtml(date, key, entries, holiday) {
  const office = entries.some((entry) => entry.office);
  const siteCount = entries.filter((entry) => !entry.office).length;
  const taskNames = [...new Set(entries.flatMap((entry) => entry.tasks || []))].slice(0, 3);
  const body = entries.length
    ? `<span class="journal-stamp">${office && !siteCount ? "사무실" : `현장 ${siteCount || entries.length}곳`}</span>
       <div class="mini-line">${taskNames.map(escapeHtml).join(" · ") || "업무일지 작성됨"}</div>`
    : "";
  return `
    <div class="date-row"><span class="date">${date.getDate()}</span><span class="holiday-name">${holiday?.name || ""}</span></div>
    <div class="day-body">${body}</div>
    <div class="day-pay">${entries.length ? `${entries.length}건` : ""}</div>
  `;
}

function journalEntryTemplate(entry = {}, index = 0) {
  const tasks = ["설치", "점검", "배터리 교체", "UPS 교체", "철거", "유급휴가"];
  const selected = new Set(entry.tasks || []);
  return `
    <section class="journal-entry" data-index="${index}">
      <div class="entry-head">
        <strong>업무 ${index + 1}</strong>
        <button type="button" class="ghost-btn remove-journal-entry">삭제</button>
      </div>
      <label class="check-row"><input type="checkbox" class="journal-office" ${entry.office ? "checked" : ""}>사무실</label>
      <label>현장명<input type="text" class="journal-site" value="${escapeHtml(entry.siteName)}" placeholder="현장명을 입력하세요"></label>
      <label>작업기간<input type="text" class="journal-period" value="${escapeHtml(entry.period)}" placeholder="예: 09:00-11:30 또는 오전"></label>
      <fieldset>
        <legend>맡은 업무</legend>
        <div class="task-checks">
          ${tasks.map((task) => `<label class="check-row"><input type="checkbox" class="journal-task" value="${task}" ${selected.has(task) ? "checked" : ""}>${task}</label>`).join("")}
        </div>
      </fieldset>
    </section>
  `;
}

function renderJournalForm(entries = []) {
  const items = entries.length ? entries : [{ siteName: "", period: "", tasks: [], office: false }];
  els.journalEntries.innerHTML = items.map(journalEntryTemplate).join("");
}

function readJournalForm() {
  return Array.from(els.journalEntries.querySelectorAll(".journal-entry")).map((entry) => ({
    office: entry.querySelector(".journal-office").checked,
    siteName: entry.querySelector(".journal-site").value.trim(),
    period: entry.querySelector(".journal-period").value.trim(),
    tasks: Array.from(entry.querySelectorAll(".journal-task:checked")).map((task) => task.value)
  })).filter((entry) => entry.office || entry.siteName || entry.period || entry.tasks.length);
}

function renderSummary() {
  const pay = payrollReceivedIn(viewYear, viewMonth);
  const workLabel = `${pay.period.year}년 ${pay.period.month + 1}월 근무분`;
  const worked = monthRecords(pay.period.year, pay.period.month).length;
  const vacations = monthVacationRecords(pay.period.year, pay.period.month).length;
  els.grossLabel.textContent = `이번 달 지급 세전 (${workLabel})`;
  els.netLabel.textContent = `이번 달 지급 세후 (${workLabel})`;
  els.grossPay.textContent = fmtMoney.format(pay.gross);
  els.netPay.textContent = fmtMoney.format(pay.net);
  els.workedDays.textContent = `${worked}일 / 휴가 ${vacations}일`;
  els.leaveDays.textContent = `${remainingLeave(today)}일`;
  els.deductionBreakdown.innerHTML = `
    <div class="info-strip">
      <span>월급일 <strong>${pay.payday}</strong></span>
      <span>공제 예상 <strong>${fmtMoney.format(pay.deductions.total)}</strong></span>
    </div>
    <div class="money-grid compact">
      ${moneyItem("국민연금", pay.deductions.pension)}
      ${moneyItem("건강보험", pay.deductions.health)}
      ${moneyItem("장기요양", pay.deductions.care)}
      ${moneyItem("고용보험", pay.deductions.employment)}
      ${moneyItem("소득세", pay.deductions.incomeTax)}
      ${moneyItem("지방소득세", pay.deductions.localTax)}
      ${moneyItem("주휴", pay.weekly)}
      ${moneyItem("유급휴일", pay.paidHoliday)}
      ${moneyItem("휴가", pay.vacation)}
    </div>
  `;
}

function moneyItem(label, value, tone = "") {
  return `<div class="money-item ${tone}"><span>${label}</span><strong>${fmtMoney.format(value)}</strong></div>`;
}

function shortMoney(value) {
  if (!value) return "0";
  if (Math.abs(value) < 10000) return fmtMoney.format(value);
  return String(Math.round(value / 10000));
}

function handleDayClick(date) {
  const key = dateKey(date);
  const existing = state.days[key] || null;
  selectedDateKey = key;
  const record = existing || baseWorkRecord(date);
  els.dialogDate.textContent = `${key} 기록`;
  els.dayWage.value = record.wage || state.settings.hourlyWage;
  els.dayStart.value = record.start || state.settings.defaultStart;
  els.dayEnd.value = record.end || state.settings.defaultEnd;
  els.dayBreak.value = record.breakHours ?? state.settings.breakHours;
  els.dayType.value = record.type === "holiday" || isHoliday(date) ? "holiday" : "normal";
  els.dialog.showModal();
}

function handleJournalDayClick(date) {
  const key = dateKey(date);
  selectedDateKey = key;
  els.journalDate.textContent = `${key} 업무일지`;
  renderJournalForm(state.journals[key] || []);
  els.journalDialog.showModal();
}

function recordFromDialog() {
  return {
    worked: true,
    wage: Number(els.dayWage.value || 0),
    start: els.dayStart.value || state.settings.defaultStart,
    end: els.dayEnd.value || state.settings.defaultEnd,
    breakHours: Number(els.dayBreak.value || 0),
    type: els.dayType.value
  };
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  state.settings = {
    ...state.settings,
    hourlyWage: Number(els.hourlyWage.value || 0),
    defaultStart: els.defaultStart.value || "09:00",
    defaultEnd: els.defaultEnd.value || "18:00",
    breakHours: Number(els.breakHours.value || 0),
    nightStart: els.nightStart.value || "22:00",
    nightEnd: els.nightEnd.value || "06:00",
    payday: Number(els.payday.value || 1),
    hireDate: els.hireDate.value || dateKey(today),
    businessSize: els.businessSize.value,
    weeklyAllowance: els.weeklyAllowance.value,
    useDeductions: els.useDeductions.checked,
    taxFreeMonthly: Number(els.taxFreeMonthly.value || 0),
    dependents: Number(els.dependents.value || 1)
  };
  saveState();
  renderCalendar();
  closeSettingsPanel();
});

lockEls.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = lockEls.password.value.trim();
  if (password.length < 4) {
    lockEls.message.textContent = "비밀번호는 4자리 이상으로 입력해주세요.";
    return;
  }
  if (!state.settings.passwordHash) {
    await setAppPassword(password);
    return;
  }
  await unlockApp(password);
});

lockEls.savePassword.addEventListener("click", async () => {
  const password = lockEls.newPassword.value.trim();
  const confirm = lockEls.confirmPassword.value.trim();
  if (password.length < 4) {
    lockEls.passwordStatus.textContent = "비밀번호는 4자리 이상으로 입력해주세요.";
    return;
  }
  if (password !== confirm) {
    lockEls.passwordStatus.textContent = "비밀번호 확인이 맞지 않습니다.";
    return;
  }
  await setAppPassword(password);
  lockEls.newPassword.value = "";
  lockEls.confirmPassword.value = "";
  lockEls.passwordStatus.textContent = "비밀번호가 저장됐습니다. 이 기기는 인증 완료 상태입니다.";
});

lockEls.lockNow.addEventListener("click", () => {
  forgetTrustedDevice();
  applyLockScreen();
});

els.dayForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const record = recordFromDialog();
  showLegalWorkAlert(selectedDateKey, record);
  state.days[selectedDateKey] = record;
  saveState();
  els.dialog.close();
  renderCalendar();
});

els.vacationDay.addEventListener("click", () => {
  if (!isEmployedOn(dateFromKey(selectedDateKey))) {
    alert("입사일 이전에는 휴가를 사용할 수 없습니다.");
    return;
  }
  if (remainingLeave(today) <= 0 && state.days[selectedDateKey]?.type !== "vacation") {
    alert("사용 가능한 휴가가 없습니다.");
    return;
  }
  state.days[selectedDateKey] = { type: "vacation", worked: false, wage: Number(els.dayWage.value || state.settings.hourlyWage) };
  saveState();
  els.dialog.close();
  renderCalendar();
});

els.deleteDay.addEventListener("click", () => {
  delete state.days[selectedDateKey];
  saveState();
  els.dialog.close();
  renderCalendar();
});

els.addJournalEntry.addEventListener("click", () => {
  const current = readJournalForm();
  current.push({ siteName: "", period: "", tasks: [], office: false });
  renderJournalForm(current);
});

els.journalEntries.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-journal-entry")) return;
  const current = readJournalForm();
  const entry = event.target.closest(".journal-entry");
  current.splice(Number(entry.dataset.index), 1);
  renderJournalForm(current);
});

els.journalForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const entries = readJournalForm();
  if (entries.length) state.journals[selectedDateKey] = entries;
  else delete state.journals[selectedDateKey];
  saveState();
  els.journalDialog.close();
  renderCalendar();
});

els.deleteJournal.addEventListener("click", () => {
  delete state.journals[selectedDateKey];
  saveState();
  els.journalDialog.close();
  renderCalendar();
});

els.prevMonth.addEventListener("click", () => {
  viewMonth -= 1;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear -= 1;
  }
  renderCalendar();
});

els.nextMonth.addEventListener("click", () => {
  viewMonth += 1;
  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear += 1;
  }
  renderCalendar();
});

els.todayBtn.addEventListener("click", () => {
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  renderCalendar();
});

els.salaryCalendarBtn.addEventListener("click", () => {
  appMode = "salary";
  renderCalendar();
});

els.journalCalendarBtn.addEventListener("click", () => {
  appMode = "journal";
  renderCalendar();
});

let settingsPanelHistory = false;

function isMobileLayout() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function openSettingsPanel() {
  if (els.settingsPanel.classList.contains("open")) return;
  els.settingsPanel.classList.add("open");
  els.menuScrim.classList.add("open");
  document.body.classList.add("settings-open");
  if (isMobileLayout()) {
    history.pushState({ settingsPanel: true }, "", location.href);
    settingsPanelHistory = true;
  }
}

function closeSettingsPanel(fromHistory = false) {
  if (!els.settingsPanel.classList.contains("open")) return;
  els.settingsPanel.classList.remove("open");
  els.menuScrim.classList.remove("open");
  document.body.classList.remove("settings-open");
  if (settingsPanelHistory) {
    settingsPanelHistory = false;
    if (!fromHistory) history.back();
  }
}

els.openSettings.addEventListener("click", openSettingsPanel);
els.closeSettings.addEventListener("click", () => closeSettingsPanel());
els.menuScrim.addEventListener("click", () => closeSettingsPanel());

window.addEventListener("popstate", () => {
  if (els.settingsPanel.classList.contains("open")) closeSettingsPanel(true);
});

els.salaryQueryBtn.addEventListener("click", () => {
  els.queryYear.value = viewYear;
  els.queryMonth.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i}">${i + 1}월 지급</option>`).join("");
  els.queryMonth.value = viewMonth;
  renderSalaryQuery(false);
  els.salaryDialog.showModal();
});

els.queryOne.addEventListener("click", () => renderSalaryQuery(false));
els.queryAll.addEventListener("click", () => renderSalaryQuery(true));
els.queryMonth.addEventListener("change", () => renderSalaryQuery(false));

function renderSalaryQuery(showAll) {
  const year = Number(els.queryYear.value || viewYear);
  const month = Number(els.queryMonth.value || 0);
  const pay = payrollReceivedIn(year, month);
  const values = Array.from({ length: 12 }, (_, i) => ({ month: i, pay: payrollReceivedIn(year, i) }));
  const annualGross = values.reduce((sum, item) => sum + item.pay.gross, 0);
  const annualNet = values.reduce((sum, item) => sum + item.pay.net, 0);
  els.salaryDialog.classList.toggle("annual-mode", showAll);
  els.queryOne.classList.toggle("active", !showAll);
  els.queryAll.classList.toggle("active", showAll);
  els.queryOne.setAttribute("aria-pressed", String(!showAll));
  els.queryAll.setAttribute("aria-pressed", String(showAll));
  if (showAll) {
    els.salaryResult.innerHTML = `
    <div class="salary-section">
      <div class="section-title">${year}년 지급 연봉</div>
      <div class="money-grid two">
        ${moneyItem("연봉 세전", annualGross, "primary")}
        ${moneyItem("연봉 세후", annualNet, "primary")}
      </div>
      <p class="chart-note">막대는 월별 세후 지급액 기준입니다. 그래프 금액 단위는 만원입니다.</p>
    </div>
    `;
  } else {
    els.salaryResult.innerHTML = `
    <div class="salary-title">
      <strong>${year}년 ${month + 1}월 지급 급여</strong>
      <span>${pay.period.year}년 ${pay.period.month + 1}월 근무분 · 월급일 ${pay.payday}</span>
    </div>
    <div class="money-grid two">
      ${moneyItem("세전", pay.gross, "primary")}
      ${moneyItem("세후", pay.net, "primary")}
    </div>
    <div class="money-grid compact">
      ${moneyItem("근무", pay.workPay)}
      ${moneyItem("주휴", pay.weekly)}
      ${moneyItem("유급휴일", pay.paidHoliday)}
      ${moneyItem("휴가", pay.vacation)}
      ${moneyItem("공제", pay.deductions.total)}
    </div>
  `;
  }
  const max = Math.max(1, ...values.map((item) => item.pay.net));
  els.salaryGraph.innerHTML = showAll ? values.map((item) => {
    const height = Math.max(4, Math.round((item.pay.net / max) * 100));
    return `<div class="bar-row">
      <div class="bar-track"><div class="bar-fill" style="height:${height}%"></div></div>
      <span>${item.month + 1}월</span>
      <strong>${shortMoney(item.pay.net)}</strong>
    </div>`;
  }).join("") : "";
}

els.exportData.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `salary-calendar-backup-${dateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

els.importData.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const imported = JSON.parse(await file.text());
  if (!imported.settings || !imported.days) {
    alert("급여 달력 백업 파일이 아닙니다.");
    return;
  }
  state = normalizeState(imported);
  saveState();
  renderSettings();
  renderCalendar();
  alert("가져오기가 완료됐습니다.");
});

els.driveConnect.addEventListener("click", async () => {
  try {
    setDriveStatus("Google Drive 연결 중...");
    await ensureDriveToken("consent");
    setDriveStatus("Drive 연결 완료. 불러오기 또는 저장을 눌러주세요.");
    if (driveMeta.autoSync) await loadFromDrive();
  } catch (error) {
    setDriveStatus(`Drive 연결 실패: ${error.message}`);
  }
});

els.driveLoad.addEventListener("click", async () => {
  try {
    await ensureDriveToken("", { allowPopup: false });
    await loadFromDrive({ force: true });
  } catch (error) {
    setDriveStatus(`Drive 불러오기 실패: ${error.message}`);
  }
});

els.driveSave.addEventListener("click", async () => {
  try {
    await ensureDriveToken("", { allowPopup: false });
    await saveToDrive();
  } catch (error) {
    setDriveStatus(`Drive 저장 실패: ${error.message}`);
  }
});

els.driveAutoSync.addEventListener("change", async () => {
  driveMeta.autoSync = els.driveAutoSync.checked;
  saveDriveMeta();
  updateDriveControls();
  if (!driveMeta.autoSync) {
    setDriveStatus("자동 동기화가 꺼졌습니다.");
    return;
  }
  try {
    await ensureDriveToken("", { allowPopup: false });
    await loadFromDrive();
    scheduleDriveAutoSave();
  } catch (error) {
    driveMeta.autoSync = false;
    saveDriveMeta();
    updateDriveControls();
    setDriveStatus(`자동 동기화 시작 실패: ${error.message}`);
  }
});

if ("serviceWorker" in navigator) {
  let refreshedByNewWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshedByNewWorker) return;
    refreshedByNewWorker = true;
    location.reload();
  });
  navigator.serviceWorker.register("./service-worker.js")
    .then((registration) => registration.update())
    .catch(() => {});
}

saveState();
updateDriveControls();
if (driveMeta.autoSync) setDriveStatus("자동 동기화가 켜져 있습니다. Drive 연결을 눌러주세요.");
renderSettings();
renderCalendar();
applyLockScreen();
