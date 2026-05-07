function resolveApiBase() {
  const configuredBase = window.APP_CONFIG && window.APP_CONFIG.API_BASE ? window.APP_CONFIG.API_BASE : '/api';
  const isHttpsPage = window.location.protocol === 'https:';
  const isSameHostAbsoluteBase = configuredBase.includes(`//${window.location.hostname}:`);

  if (isHttpsPage && isSameHostAbsoluteBase) {
    return '/api';
  }

  return configuredBase;
}

const API_BASE = resolveApiBase();
const APP_BASE = resolveAppBase(API_BASE);

function resolveAppBase(apiBase) {
  return apiBase.replace(/\/api\/?$/, '');
}

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

function fileUrl(filePath) {
  return `${APP_BASE}/files${filePath}`;
}

let productsMap = {};
let phasesMap = {};
let selectedProductId = null;
let receiptFilter = 'all';
let receiptSearch = '';
let mediaFilter = 'all';
let documentFilter = 'all';
let documentScope = 'selected';
let documentSearch = '';
let documentSort = 'newest';
let diaryFilter = 'all';
let focusedReceiptId = null;
let openReceiptEditorId = null;
let openMediaEditorId = null;
let openDocumentEditorId = null;
let lastWatchFolderCounts = { total: 0, image: 0, video: 0, file: 0 };
let lastManualDocumentProductId = null;
const PROJECT_DOCS_WORKBENCH = 'projektova dokumentace rd';
const TRIAGE_PREFS_KEY = 'rd-lounin-triage-prefs-v1';
const TRIAGE_DEFERRED_KEY = 'rd-lounin-triage-deferred-v1';
const THEME_KEY = 'rd-lounin-theme-v1';
const LAYOUT_KEY = 'rd-lounin-layout-v1';
const AUTH_TOKEN_KEY = 'rd-lounin-auth-token-v1';
let deferredDocumentIds = [];
let authToken = '';
let currentUser = null;
let appBootStarted = false;
let diaryWeatherTimer = null;
let diaryCalendarYear = new Date().getFullYear();
let diaryCalendarMonth = new Date().getMonth();
let lastDiaryEntries = [];
let editingDiaryId = null;

function closestAppSection(element) {
  return element ? element.closest('section[id]') : null;
}

function setActiveNav(sectionId) {
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });
}

function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.body.classList.toggle('theme-dark', nextTheme === 'dark');
  const toggle = document.getElementById('themeToggle');
  const icon = document.getElementById('themeIcon');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(nextTheme === 'dark'));
    toggle.title = nextTheme === 'dark' ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim';
  }
  if (icon) icon.textContent = nextTheme === 'dark' ? '☀' : '☾';
  try {
    window.localStorage.setItem(THEME_KEY, nextTheme);
  } catch (_) {}
}

function applyLayoutMode(mode) {
  const compact = mode === 'compact';
  document.body.classList.toggle('compact-mode', compact);
  const toggle = document.getElementById('layoutToggle');
  if (toggle) toggle.textContent = compact ? 'AUTO' : 'PC';
  try {
    window.localStorage.setItem(LAYOUT_KEY, compact ? 'compact' : 'desktop');
  } catch (_) {}
}

function initAppShell() {
  let storedTheme = 'light';
  try {
    storedTheme = window.localStorage.getItem(THEME_KEY) || storedTheme;
  } catch (_) {}

  applyTheme(storedTheme);

  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionId = button.dataset.section;
      if (!sectionId) return;
      setActiveNav(sectionId);
      scrollToSection(sectionId);
    });
  });

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      applyTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark');
    });
  }
}

const STARTER_PRODUCTS_TOP8 = [
  { name: 'Zakladova deska', description: 'Konstrukcni celek: skladba, vykresy, kalkulace, fotky armovani a betonaze.' },
  { name: 'Zdivo', description: 'Nosny a vyplnovy system: cihly, preklady, technicke listy, fotky zdeni.' },
  { name: 'Stropy', description: 'Varianty a realizace stropu: MIAKO / SPIROLL / PREFA, statika, montaz.' },
  { name: 'Stresni plast', description: 'Krytina, folie, late, detaily, fotky realizace strechy.' },
  { name: 'Svislá okna a dveře', description: 'Fasádní okna, vstupní dveře, specifikace, doklady, záruky.' },
  { name: 'Tepelné čerpadlo', description: 'Vybraný systém vytápění: nabídky, technické listy, záruka, servis.' },
  { name: 'Podlahove topeni', description: 'Rozvody podlahoveho topeni, projekt okruhu, fotky pred zalitim.' },
  { name: 'FVE', description: 'Panely, menic, pripojovaci podminky, montazni system, revize.' }
];

const STARTER_PRODUCTS_ALL16 = [
  ...STARTER_PRODUCTS_TOP8,
  { name: 'Zemni prace', description: 'Vykopy, technika, priprava terenu, odvoz zeminy, doklady a fotky.' },
  { name: 'Stresni okna', description: 'Stresni okna, lemovani, montazni detaily, katalogy a doklady.' },
  { name: 'Stineni', description: 'Predokenni rolety a zaluzie, ovladani, barvy, nabidky a doklady.' },
  { name: 'Podlahove souvrstvi', description: 'Skladba podlahy, izolace, systemove vrstvy, anhydrit nebo beton.' },
  { name: 'Rekuperacni jednotka', description: 'Jednotka VZT se zarukou a servisem, technicke listy, vyber modelu.' },
  { name: 'Rozvody rekuperace', description: 'Potrubi, tvarovky, trasy, fotky pred zaklopenim, seznam prvku.' },
  { name: 'Inzenyrske site a pripojky', description: 'Voda, elektro, kanalizace, vyjadreni spravcu siti, sachtice.' },
  { name: 'Destove hospodarstvi', description: 'Destova nebo retencni jimka, odvodneni, hospodareni s destovou vodou.' }
];

const PRODUCT_GUIDE = {
  'zemni prace': { order: 1, group: 'Priprava', uploads: 'nabidky, fotky vykopu, technika, doklady' },
  'zakladova deska': { order: 2, group: 'Konstrukce', uploads: 'vykresy, skladba, fotky armovani, betonaz' },
  'zdivo': { order: 3, group: 'Konstrukce', uploads: 'technicke listy, nabidky cihel, fotky zdeni' },
  'stropy': { order: 4, group: 'Konstrukce', uploads: 'varianty stropu, statika, montazni fotky' },
  'stresni plast': { order: 5, group: 'Obalka', uploads: 'skladba strechy, krytina, detaily, fotky' },
  'svisla okna a dvere': { order: 6, group: 'Obalka', uploads: 'specifikace, nabidky, doklady, stitky' },
  'stresni okna': { order: 7, group: 'Obalka', uploads: 'katalogy, lemovani, montazni detaily' },
  'stineni': { order: 8, group: 'Obalka', uploads: 'nabidky, ovladani, barvy, doklady' },
  'tepelne cerpadlo': { order: 9, group: 'Technologie', uploads: 'nabidky, TL, zaruka, servis, spusteni' },
  'podlahove topeni': { order: 10, group: 'Technologie', uploads: 'projekt okruhu, fotky pred zalitim, zkousky' },
  'podlahove souvrstvi': { order: 11, group: 'Interier', uploads: 'skladba, anhydrit nebo beton, TL, fotky' },
  'rekuperacni jednotka': { order: 12, group: 'Technologie', uploads: 'vyber jednotky, TL, zaruka, servis' },
  'rozvody rekuperace': { order: 13, group: 'Technologie', uploads: 'trasy, potrubi, tvarovky, fotky' },
  'fve': { order: 14, group: 'Technologie', uploads: 'panely, menic, PP, revize, montazni system' },
  'inzenyrske site a pripojky': { order: 15, group: 'Site', uploads: 'vyjadreni spravcu, situace, pripojky' },
  'destove hospodarstvi': { order: 16, group: 'Site', uploads: 'jimka, destovka, odvodneni, fotky' }
};

function normalizeProductKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getProductGuide(productName) {
  return PRODUCT_GUIDE[normalizeProductKey(productName)] || null;
}

function sortProductsByGuide(products) {
  return [...products].sort((a, b) => {
    const ga = getProductGuide(a.name);
    const gb = getProductGuide(b.name);
    const oa = ga?.order ?? 9999;
    const ob = gb?.order ?? 9999;
    if (oa !== ob) return oa - ob;
    return String(a.name || '').localeCompare(String(b.name || ''), 'cs');
  });
}

function setPhotoStatus(message, kind = '') {
  const el = document.getElementById('photoStatus');
  if (!el) return;
  el.className = `muted ${kind ? `status-${kind}` : ''}`.trim();
  el.textContent = message || '';
}

function setProductTemplateStatus(message, kind = '') {
  const el = document.getElementById('productTemplateStatus');
  if (!el) return;
  el.className = `muted ${kind ? `status-${kind}` : ''}`.trim();
  el.textContent = message || '';
}

function formatMb(bytes) {
  return `${Math.round((Number(bytes || 0) / 1024 / 1024) * 10) / 10} MB`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('cs-CZ');
}

function formatMoney(value) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

async function copyText(value, successMessage = 'Zkopirovano.') {
  const text = String(value || '');
  if (!text) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setPhotoStatus(successMessage, 'ok');
  } catch (_) {
    setPhotoStatus('MISS: kopírování selhalo', 'miss');
  }
}

function setMediaFilter(filter) {
  mediaFilter = filter;
  updateMediaFilterButtons();
  loadPhotos();
}

function updateMediaFilterButtons() {
  const ids = ['all', 'image', 'video'];
  ids.forEach((id) => {
    const btn = document.getElementById(`media-filter-${id}`);
    if (!btn) return;
    btn.classList.toggle('active', mediaFilter === id);
  });
}

async function parseJsonResponse(response, label) {
  let payload = null;

  try {
    payload = await response.json();
  } catch (_) {}

  if (!response.ok) {
    const detail = payload?.error || payload?.message || `HTTP ${response.status}`;
    throw new Error(`${label} ${detail}`);
  }

  return payload;
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

async function apiGet(path) {
  const response = await fetch(apiUrl(path), { headers: authHeaders() });
  return parseJsonResponse(response, `GET ${path}`);
}

async function apiPost(path, data) {
  const options = { method: 'POST' };
  if (data !== undefined) {
    options.headers = authHeaders({ 'Content-Type': 'application/json' });
    options.body = JSON.stringify(data);
  } else {
    options.headers = authHeaders();
  }
  const response = await fetch(apiUrl(path), options);
  return parseJsonResponse(response, `POST ${path}`);
}

async function apiPut(path, data) {
  const response = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  });
  return parseJsonResponse(response, `PUT ${path}`);
}

async function apiDelete(path) {
  const response = await fetch(apiUrl(path), { method: 'DELETE', headers: authHeaders() });
  return parseJsonResponse(response, `DELETE ${path}`);
}

function setAuthStatus(message, kind = '') {
  const el = document.getElementById('authStatus');
  if (!el) return;
  el.className = `muted ${kind ? `status-${kind}` : ''}`.trim();
  el.textContent = message || '';
}

function showAuthMode(mode) {
  const authView = document.getElementById('authView');
  const appShell = document.getElementById('appShell');
  const setupPanel = document.getElementById('authSetupPanel');
  const loginPanel = document.getElementById('authLoginPanel');
  if (authView) authView.hidden = false;
  if (appShell) appShell.hidden = true;
  if (setupPanel) setupPanel.hidden = mode !== 'setup';
  if (loginPanel) loginPanel.hidden = mode !== 'login';
  const setupTitle = setupPanel?.querySelector('h2');
  const setupText = setupPanel?.querySelector('p');
  const setupButton = setupPanel?.querySelector('button');
  if (setupTitle) setupTitle.textContent = mode === 'setup' && currentUser === null ? 'Vytvořit účet' : 'První spuštění';
  if (setupText) setupText.textContent = 'Vytvoř uživatele. PIN bude sloužit pro rychlé přihlášení.';
  if (setupButton) setupButton.textContent = 'Vytvořit a přihlásit';
}

function friendlyAuthError(error) {
  const message = String(error?.message || error || '');
  if (message.includes('username_exists')) return 'Uživatel s tímto loginem už existuje. Zvol jiné uživatelské jméno, nebo se přihlas.';
  if (message.includes('setup_already_done')) return 'První účet už existuje. Přepni se zpět na přihlášení a použij svůj login, heslo nebo PIN.';
  if (message.includes('invalid_registration') || message.includes('invalid_setup')) return 'Vyplň jméno, uživatelské jméno a heslo alespoň 6 znaků.';
  if (message.includes('invalid_credentials')) return 'Nesedí uživatelské jméno, heslo nebo PIN.';
  if (message.includes('credentials_required')) return 'Vyplň uživatelské jméno a heslo, nebo PIN.';
  return `Nepovedlo se dokončit akci: ${message}`;
}

function toggleHeaderOverview() {
  const panel = document.getElementById('headerOverviewPanel');
  if (panel) panel.hidden = !panel.hidden;
}

function showApplication() {
  const authView = document.getElementById('authView');
  const appShell = document.getElementById('appShell');
  if (authView) authView.hidden = true;
  if (appShell) appShell.hidden = false;
  const userButton = document.getElementById('userButton');
  if (userButton && currentUser) userButton.textContent = currentUser.name || currentUser.username || 'Uživatel';
}

function persistAuth(token, user) {
  authToken = token || '';
  currentUser = user || null;
  try {
    if (authToken) window.localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    else window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (_) {}
}

async function initAuth() {
  try {
    authToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
  } catch (_) {
    authToken = '';
  }

  let bootstrap;
  try {
    bootstrap = await apiGet('/auth/bootstrap');
  } catch (e) {
    setAuthStatus(`MISS auth: ${e.message}`, 'miss');
    showAuthMode('login');
    return false;
  }

  if (bootstrap.needs_setup) {
    setAuthStatus('Vytvoř prvního uživatele.', 'ok');
    showAuthMode('setup');
    return false;
  }

  if (authToken) {
    try {
      const me = await apiGet('/auth/me');
      currentUser = me.user;
      showApplication();
      return true;
    } catch (_) {
      persistAuth('', null);
    }
  }

  setAuthStatus('Přihlas se heslem nebo PINem.', '');
  showAuthMode('login');
  return false;
}

async function setupFirstUser() {
  try {
    let bootstrap = { needs_setup: false };
    try {
      bootstrap = await apiGet('/auth/bootstrap');
    } catch (_) {}

    const payload = await apiPost(bootstrap.needs_setup ? '/auth/setup' : '/auth/register', {
      name: document.getElementById('authName').value.trim(),
      username: document.getElementById('authSetupUsername').value.trim(),
      password: document.getElementById('authSetupPassword').value,
      pin: document.getElementById('authSetupPin').value
    });
    persistAuth(payload.token, payload.user);
    showApplication();
    await bootApplication();
  } catch (e) {
    const message = friendlyAuthError(e);
    setAuthStatus(message, 'miss');
    alert(message);
  }
}

async function loginUser() {
  try {
    const payload = await apiPost('/auth/login', {
      username: document.getElementById('authLoginUsername').value.trim(),
      password: document.getElementById('authLoginPassword').value,
      pin: document.getElementById('authLoginPin').value
    });
    persistAuth(payload.token, payload.user);
    showApplication();
    await bootApplication();
  } catch (e) {
    const message = friendlyAuthError(e);
    setAuthStatus(message, 'miss');
    alert(message);
  }
}

async function logoutUser() {
  try {
    if (authToken) await apiPost('/auth/logout');
  } catch (_) {}
  persistAuth('', null);
  showAuthMode('login');
  setAuthStatus('Odhlášeno.', 'ok');
}

function openUserPanel() {
  const panel = document.getElementById('userPanel');
  const content = document.getElementById('userPanelContent');
  if (content) {
    content.innerHTML = currentUser
      ? `<b>${esc(currentUser.name || '-')}</b><br><small>Uživatel: ${esc(currentUser.username || '-')} | ID: ${esc(currentUser.id)}</small><br><small>PIN a Face ID rozšíříme v další iteraci.</small>`
      : 'Uživatel není načten.';
  }
  if (panel) panel.hidden = false;
}

function closeUserPanel() {
  const panel = document.getElementById('userPanel');
  if (panel) panel.hidden = true;
}

function selectedProductName() {
  if (!selectedProductId) return 'vse';
  return productsMap[selectedProductId] || `produkt #${selectedProductId}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isProjectDocsWorkbench(name) {
  return normalizeText(name) === PROJECT_DOCS_WORKBENCH;
}

function saveTriagePrefs() {
  try {
    window.localStorage.setItem(TRIAGE_PREFS_KEY, JSON.stringify({
      selectedProductId,
      documentFilter,
      documentScope,
      documentSearch,
      documentSort,
      lastManualDocumentProductId
    }));
  } catch (_) {}
}

function restoreTriagePrefs() {
  try {
    const raw = window.localStorage.getItem(TRIAGE_PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (prefs && typeof prefs === 'object') {
      if (prefs.selectedProductId !== undefined && prefs.selectedProductId !== null && prefs.selectedProductId !== '') {
        selectedProductId = Number(prefs.selectedProductId);
      }
      if (typeof prefs.documentFilter === 'string') documentFilter = prefs.documentFilter;
      if (typeof prefs.documentScope === 'string') documentScope = prefs.documentScope;
      if (typeof prefs.documentSearch === 'string') documentSearch = prefs.documentSearch;
      if (typeof prefs.documentSort === 'string') documentSort = prefs.documentSort;
      if (prefs.lastManualDocumentProductId !== undefined && prefs.lastManualDocumentProductId !== null && prefs.lastManualDocumentProductId !== '') {
        lastManualDocumentProductId = Number(prefs.lastManualDocumentProductId);
      }
    }
  } catch (_) {}
}

function saveDeferredDocumentIds() {
  try {
    window.localStorage.setItem(TRIAGE_DEFERRED_KEY, JSON.stringify(deferredDocumentIds));
  } catch (_) {}
}

function restoreDeferredDocumentIds() {
  try {
    const raw = window.localStorage.getItem(TRIAGE_DEFERRED_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      deferredDocumentIds = parsed
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
  } catch (_) {}
}

function isDeferredDocument(docId) {
  return deferredDocumentIds.includes(Number(docId));
}

function deferDocumentId(docId) {
  const id = Number(docId);
  if (!Number.isFinite(id) || id <= 0 || isDeferredDocument(id)) return;
  deferredDocumentIds = [...deferredDocumentIds, id];
  saveDeferredDocumentIds();
}

function undeferDocumentId(docId) {
  const id = Number(docId);
  deferredDocumentIds = deferredDocumentIds.filter((value) => Number(value) !== id);
  saveDeferredDocumentIds();
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const section = closestAppSection(el) || el;
  setActiveNav(section.id);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openProductDocuments() {
  documentFilter = 'all';
  updateDocumentFilterButtons();
  loadDocuments();
  scrollToSection('documentsList');
}

function openProductReceipts() {
  receiptFilter = 'all';
  updateReceiptToolbar([]);
  loadReceipts();
  scrollToSection('receiptsList');
}

function openProductMedia() {
  mediaFilter = 'all';
  updateMediaFilterButtons();
  loadPhotos();
  scrollToSection('photosGrid');
}

function openProductDiary() {
  diaryFilter = 'product';
  updateDiaryFilterButtons();
  loadDiary();
  scrollToSection('diaryList');
}

async function loadSelectedProductSummary() {
  const el = document.getElementById('selectedProductSummary');
  const guideEl = document.getElementById('selectedProductGuide');
  const healthEl = document.getElementById('selectedProductHealth');
  const issuesEl = document.getElementById('selectedProductIssues');
  const nextEl = document.getElementById('selectedProductNext');
  const completionEl = document.getElementById('selectedProductCompletion');
  const checklistEl = document.getElementById('selectedProductChecklist');
  if (!el) return;

  if (!selectedProductId) {
    el.textContent = 'Vyber stavební okruh.';
    if (guideEl) guideEl.textContent = 'Zarazeni: -';
    if (healthEl) healthEl.textContent = 'Stav okruhu: -';
    if (issuesEl) issuesEl.textContent = 'K reseni: -';
    if (nextEl) nextEl.textContent = 'Další krok: -';
    if (completionEl) completionEl.textContent = 'Hotovost: -';
    if (checklistEl) checklistEl.textContent = 'Checklist: -';
    return;
  }

  try {
    const [documents, receipts, photos, diary] = await Promise.all([
      apiGet(`/documents?product_id=${selectedProductId}`),
      apiGet(`/receipts?product_id=${selectedProductId}`),
      apiGet(`/photos?product_id=${selectedProductId}`),
      apiGet('/diary')
    ]);

    const documentList = documents || [];
    const diaryForProduct = (diary || []).filter((entry) => Number(entry.product_id) === Number(selectedProductId));
    const photoList = photos || [];
    const receiptList = receipts || [];
    const currentProductName = selectedProductName();
    const guide = getProductGuide(currentProductName);
    const isWorkbench = isProjectDocsWorkbench(currentProductName);
    const pdfDocuments = documentList.filter((item) => getDocumentKind(item) === 'pdf').length;
    const imageDocuments = documentList.filter((item) => getDocumentKind(item) === 'image').length;
    const otherDocuments = documentList.filter((item) => getDocumentKind(item) === 'other').length;
    const imageCount = photoList.filter((item) => item.media_kind === 'image').length;
    const videoCount = photoList.filter((item) => item.media_kind === 'video').length;
    const readyReceipts = receiptList.filter((item) => item.status === 'ready').length;
    const pendingReceipts = receiptList.filter((item) => item.status !== 'ready').length;
    const reviewNeeded = receiptList.filter((item) => item.ocr_status === 'review_needed').length;
    const missingSupplier = receiptList.filter((item) => !(item.supplier || item.vendor)).length;
    const missingDocumentNumber = receiptList.filter((item) => !item.document_number).length;
    const missingPurchaseDate = receiptList.filter((item) => !(item.purchase_date || item.date)).length;
    const expiringSoon = receiptList.filter((item) => {
      if (!item.warranty_until) return false;
      const now = new Date();
      const warrantyDate = new Date(item.warranty_until);
      const diffDays = (warrantyDate - now) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 30;
    }).length;
    const inboxCount = Number(lastWatchFolderCounts.total || 0);
    const criticalIssues =
      pendingReceipts +
      reviewNeeded +
      missingSupplier +
      missingDocumentNumber +
      missingPurchaseDate +
      expiringSoon +
      inboxCount;
    const productHealth =
      criticalIssues === 0 ? 'cisty' :
      criticalIssues <= 2 ? 'stabilni' :
      criticalIssues <= 5 ? 'pozor' :
      'akce';

    const checklist = [
      { ok: documentList.length > 0, label: 'dokumenty' },
      { ok: receiptList.length > 0, label: 'receipts' },
      { ok: pendingReceipts === 0, label: 'receipts ready' },
      { ok: photoList.length > 0, label: 'media' },
      { ok: diaryForProduct.length > 0, label: 'denik' },
      { ok: inboxCount === 0, label: 'inbox cisty' }
    ];
    const doneChecklist = checklist.filter((item) => item.ok).length;
    const completionPct = Math.round((doneChecklist / checklist.length) * 100);

    let nextStep = 'Bez akutni akce.';
    if (isWorkbench) nextStep = 'Třídit dokumentaci do cílových okruhů.';
    else if (inboxCount > 0) nextStep = `Zpracuj inbox media (${inboxCount}).`;
    else if (reviewNeeded > 0) nextStep = `Zkontroluj OCR receipts (${reviewNeeded}).`;
    else if (missingDocumentNumber > 0) nextStep = `Dopln cislo dokladu u receipts (${missingDocumentNumber}).`;
    else if (missingSupplier > 0) nextStep = `Dopln dodavatele u receipts (${missingSupplier}).`;
    else if (missingPurchaseDate > 0) nextStep = `Dopln datum nakupu u receipts (${missingPurchaseDate}).`;
    else if (pendingReceipts > 0) nextStep = `Dokoncit pending receipts (${pendingReceipts}).`;
    else if (expiringSoon > 0) nextStep = `Zkontroluj záruky končící do 30 dní (${expiringSoon}).`;
    else if (!documentList.length) nextStep = 'Pridat prvni dokument k okruhu.';
    else if (!photoList.length) nextStep = 'Pridat prvni foto nebo video.';
    else if (!diaryForProduct.length) nextStep = 'Pridat prvni zapis do deniku.';

    el.textContent =
      `Okruh: ${currentProductName}${isWorkbench ? ' | staging/workbench' : ''} | dokumenty: ${documentList.length} (pdf ${pdfDocuments}, obrázky ${imageDocuments}, ostatní ${otherDocuments}) | receipts: ${receiptList.length} (ready ${readyReceipts}, pending ${pendingReceipts}) | media: ${photoList.length} (obrázky ${imageCount}, videa ${videoCount}) | diary: ${diaryForProduct.length} | diary filtr: ${diaryFilter}`;

    if (guideEl) {
      guideEl.textContent = isWorkbench
        ? 'Zarazeni: staging/workbench | nahrat: projektova dokumentace, rozpocty, vykresy, technicke podklady'
        : guide
        ? `Zarazeni: #${guide.order} | skupina: ${guide.group} | nahrat: ${guide.uploads}`
        : 'Zařazení: vlastní stavební okruh bez šablony';
    }

    if (healthEl) {
      healthEl.textContent = isWorkbench
        ? `Stav okruhu: staging | problémů: ${criticalIssues}`
        : `Stav okruhu: ${productHealth} | problémů: ${criticalIssues}`;
    }

    if (issuesEl) {
      const parts = [
        `pending ${pendingReceipts}`,
        `review ${reviewNeeded}`,
        `chybí doklad ${missingDocumentNumber}`,
        `chybí dodavatel ${missingSupplier}`,
        `chybí datum ${missingPurchaseDate}`,
        `zaruka do 30 dni ${expiringSoon}`,
        `inbox ${inboxCount}`
      ];
      const suggestedDocumentCount = documentList.filter((item) => {
        const suggestion = suggestDocumentTarget(item);
        return suggestion && Number(suggestion.productId) !== Number(item.product_id);
      }).length;
      const unsortedDocumentCount = documentList.filter((item) => !suggestDocumentTarget(item)).length;
      issuesEl.textContent = isWorkbench
        ? `K reseni: trideni dokumentace | doporučené ${suggestedDocumentCount} | bez návrhu ${unsortedDocumentCount} | inbox ${inboxCount}`
        : `K reseni: ${parts.join(' | ')}`;
    }

    if (nextEl) {
      nextEl.textContent = `Další krok: ${nextStep}`;
    }
    if (completionEl) {
      completionEl.textContent = isWorkbench
        ? `Hotovost: staging | dokumenty ${documentList.length} | doporučené ${documentList.filter((item) => {
            const suggestion = suggestDocumentTarget(item);
            return suggestion && Number(suggestion.productId) !== Number(item.product_id);
          }).length}`
        : `Hotovost: ${completionPct}% | splneno ${doneChecklist}/${checklist.length}`;
    }
    if (checklistEl) {
      checklistEl.textContent = isWorkbench
        ? `Checklist: ${documentList.length ? 'OK' : 'MISS'} dokumentace nahrana | ${documentList.some((item) => !!suggestDocumentTarget(item)) ? 'OK' : 'MISS'} navrhy trideni | ${documentList.some((item) => !suggestDocumentTarget(item)) ? 'OK' : 'MISS'} zbyva rucni triage`
        : `Checklist: ${checklist.map((item) => `${item.ok ? 'OK' : 'MISS'} ${item.label}`).join(' | ')}`;
    }
  } catch (e) {
    el.textContent = `MISS: ${e.message}`;
    if (guideEl) guideEl.textContent = `MISS: ${e.message}`;
    if (healthEl) healthEl.textContent = `MISS: ${e.message}`;
    if (issuesEl) issuesEl.textContent = `MISS: ${e.message}`;
    if (nextEl) nextEl.textContent = `MISS: ${e.message}`;
    if (completionEl) completionEl.textContent = `MISS: ${e.message}`;
    if (checklistEl) checklistEl.textContent = `MISS: ${e.message}`;
  }
}

function setReceiptStatus(message, kind = '') {
  const el = document.getElementById('receiptStatus');
  if (!el) return;
  el.className = `muted ${kind ? `status-${kind}` : ''}`.trim();
  el.textContent = message || '';
}

function updateReceiptToolbar(receipts = []) {
  const selectedEl = document.getElementById('receiptSelectedProduct');
  const summaryEl = document.getElementById('receiptSummary');

  if (selectedEl) {
    selectedEl.textContent = `Okruh: ${selectedProductName()}`;
  }

  if (summaryEl) {
    const readyCount = receipts.filter((item) => item.status === 'ready').length;
    const pendingCount = receipts.filter((item) => item.status !== 'ready').length;
    const reviewNeededCount = receipts.filter((item) => item.ocr_status === 'review_needed').length;
    summaryEl.textContent =
      `Receipts: ${receipts.length} | ready: ${readyCount} | pending: ${pendingCount} | review: ${reviewNeededCount} | filtr: ${receiptFilter}`;
  }
}

function setReceiptSearch(value) {
  receiptSearch = String(value || '').trim().toLowerCase();
  loadReceipts();
}

function setDiaryStatus(message, kind = '') {
  const el = document.getElementById('diaryStatus');
  if (!el) return;
  el.className = `muted ${kind ? `status-${kind}` : ''}`.trim();
  el.textContent = message || '';
}

function setDiaryFilter(filter) {
  diaryFilter = filter;
  updateDiaryFilterButtons();
  loadDiary();
}

function updateDiaryFilterButtons() {
  const ids = ['all', 'product'];
  ids.forEach((id) => {
    const btn = document.getElementById(`diary-filter-${id}`);
    if (!btn) return;
    btn.classList.toggle('active', diaryFilter === id);
  });
}

async function bootStatus() {
  const el = document.getElementById('apiStatus');
  try {
    const status = await apiGet('/status');
    el.textContent =
      `API: ${status.api}\n` +
      `DB: ${status.db}\n` +
      `Pracovní etapy: ${status.counts?.phases ?? '-'}\n` +
      `Mistnosti: ${status.counts?.rooms ?? '-'}\n` +
      `Stavební okruhy: ${status.counts?.products ?? '-'}`;
  } catch (e) {
    el.textContent = `MISS: ${e.message}`;
  }
}

function markBootMiss(section, error) {
  const message = `MISS ${section}: ${error.message}`;
  const apiEl = document.getElementById('apiStatus');
  if (apiEl) apiEl.textContent = `${apiEl.textContent || ''}\n${message}`.trim();
  console.error(message, error);
}

async function runBootStep(section, fn, onError) {
  try {
    await fn();
    return true;
  } catch (error) {
    markBootMiss(section, error);
    if (onError) onError(error);
    return false;
  }
}

async function loadProducts() {
  const el = document.getElementById('productsList');
  const products = sortProductsByGuide(await apiGet('/products'));

  productsMap = {};
  el.innerHTML = '';

  if (!products.length) {
    selectedProductId = null;
    el.innerHTML = '<div class="muted">Zatím žádné stavební okruhy.</div>';
    updateReceiptToolbar([]);
    loadWatchFolderMedia();
    loadSelectedProductSummary();
    return;
  }

  if (selectedProductId && !products.some((product) => Number(product.id) === Number(selectedProductId))) {
    selectedProductId = null;
  }

  products.forEach((product) => {
    productsMap[product.id] = product.name;
    if (!selectedProductId) selectedProductId = product.id;
    const guide = getProductGuide(product.name);
    const isWorkbench = isProjectDocsWorkbench(product.name);
    const selected = Number(selectedProductId) === Number(product.id);

    el.innerHTML += `
      <div class="product-row ${selected ? 'selected' : ''}" onclick="selectProduct(${product.id})">
        <div class="product-row-main">
          <b>${esc(product.name)}</b>
          <small>${guide ? `#${guide.order} | ${esc(guide.group)}` : 'vlastní okruh'}${isWorkbench ? ` | ${helpTip('staging/workbench', 'Dočasný pracovní prostor pro nahranou projektovou dokumentaci. Odtud ji třídíš do správných stavebních okruhů.')}` : ''}</small>
          <span>${esc(product.description || '')}</span>
          ${guide ? `<span class="muted">Nahrát: ${esc(guide.uploads)}</span>` : ''}
        </div>
        <div class="product-row-actions">
          <button type="button" class="ghost-btn" onclick="event.stopPropagation(); openDocumentsForProduct(${product.id});">Dokumenty</button>
          <button type="button" class="ghost-btn icon-only" title="Smazat stavební okruh" onclick="event.stopPropagation(); deleteProduct(${product.id})">Smazat</button>
        </div>
      </div>
    `;
  });

  updateReceiptToolbar([]);
  saveTriagePrefs();
  loadSelectedProductSummary();
}

async function loadBudget() {
  const el = document.getElementById('budgetList');
  const summaryEl = document.getElementById('budgetSummary');
  const statusEl = document.getElementById('budgetStatus');
  if (!el) return;

  try {
    const rows = await apiGet('/budget');
    const plannedTotal = rows.reduce((sum, item) => sum + Number(item.planned_amount || 0), 0);
    const spentTotal = rows.reduce((sum, item) => sum + Number(item.spent_amount || 0), 0);
    const remainingTotal = plannedTotal - spentTotal;
    if (summaryEl) {
      summaryEl.textContent = `Plán: ${formatMoney(plannedTotal)} | proinvestováno: ${formatMoney(spentTotal)} | zbývá: ${formatMoney(remainingTotal)}`;
    }
    if (statusEl) statusEl.textContent = `Položky: ${rows.length}`;

    if (!rows.length) {
      el.innerHTML = '<div class="card muted">Rozpočet zatím nemá stavební okruhy.</div>';
      return;
    }

    el.innerHTML = rows.map((item) => {
      const pct = Math.min(140, Math.max(0, Number(item.progress_pct || 0)));
      const stateClass = item.is_over_budget ? 'over' : item.status === 'closed' ? 'closed' : 'ok';
      return `
        <div class="budget-row ${stateClass}">
          <div class="budget-main">
            <b>${esc(item.product_name || item.name)}</b>
            <small>${esc(item.status === 'closed' ? 'uzavřeno' : 'otevřeno')} | plán ${formatMoney(item.planned_amount)} | čerpáno ${formatMoney(item.spent_amount)} | zbývá ${formatMoney(item.remaining_amount)}</small>
            <div class="budget-progress" aria-label="Čerpání rozpočtu">
              <span style="width:${pct}%;"></span>
            </div>
          </div>
          <div class="budget-actions">
            <input id="budget-planned-${item.product_id}" type="number" step="1000" value="${esc(item.planned_amount)}" aria-label="Plánovaná částka">
            <button type="button" class="ghost-btn" onclick="saveBudgetItem(${item.product_id})">Uložit plán</button>
            <button type="button" class="ghost-btn" onclick="closeBudgetItem(${item.product_id})">Uzavřít okruh</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    if (statusEl) statusEl.textContent = `MISS: ${e.message}`;
    el.innerHTML = `<div class="card muted status-miss">MISS rozpočet: ${esc(e.message)}</div>`;
  }
}

async function saveBudgetItem(productId) {
  const input = document.getElementById(`budget-planned-${productId}`);
  try {
    await apiPut(`/budget/${productId}`, { planned_amount: input?.value || 0, status: 'open' });
    await loadBudget();
  } catch (e) {
    alert(`MISS rozpočet: ${e.message}`);
  }
}

async function closeBudgetItem(productId) {
  if (!confirm('Uzavřít rozpočtový okruh a převést kladný zůstatek do disponibilní částky?')) return;
  try {
    const result = await apiPost(`/budget/${productId}/close`, { target_name: 'Disponibilní částka' });
    await loadBudget();
    const statusEl = document.getElementById('budgetStatus');
    if (statusEl) statusEl.textContent = `Uzavřeno. Přesunuto: ${formatMoney(result.transferred || 0)}.`;
  } catch (e) {
    alert(`MISS rozpočet: ${e.message}`);
  }
}

function openDocumentsForProduct(productId) {
  selectProduct(productId);
  openProductDocuments();
}

async function deleteProduct(id) {
  await apiDelete(`/products/${id}`);
  if (selectedProductId === id) selectedProductId = null;
  await loadProducts();
  await loadDocuments();
  await loadPhotos();
  await loadReceipts();
  await loadWatchFolderMedia();
  await loadDiarySelects();
  await loadSelectedProductSummary();
}

function selectProduct(id) {
  selectedProductId = id;
  saveTriagePrefs();
  updateReceiptToolbar([]);
  loadDocuments();
  loadPhotos();
  loadReceipts();
  loadWatchFolderMedia();
  syncDiaryProductToSelection();
  loadSelectedProductSummary();
}

async function createProduct(e) {
  e.preventDefault();

  await apiPost('/products', {
    name: document.getElementById('name').value,
    description: document.getElementById('description').value
  });

  document.getElementById('name').value = '';
  document.getElementById('description').value = '';

  await bootStatus();
  await loadProducts();
  await loadDiarySelects();
}

async function createStarterProducts(mode) {
  const templates = mode === 'all16' ? STARTER_PRODUCTS_ALL16 : STARTER_PRODUCTS_TOP8;

  try {
    const existing = await apiGet('/products');
    const existingNames = new Set((existing || []).map((item) => String(item.name || '').trim().toLowerCase()));

    let created = 0;
    let skipped = 0;

    for (const template of templates) {
      const key = String(template.name || '').trim().toLowerCase();
      if (!key || existingNames.has(key)) {
        skipped += 1;
        continue;
      }

      await apiPost('/products', {
        name: template.name,
        description: template.description
      });
      existingNames.add(key);
      created += 1;
    }

    await bootStatus();
    await loadProducts();
    await loadDiarySelects();
    setProductTemplateStatus(`Rychly start hotov. Vytvoreno: ${created}, preskoceno: ${skipped}.`, 'ok');
  } catch (e) {
    setProductTemplateStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

function docIcon(item) {
  const mime = item.mime_type || '';
  const name = item.name || item.original_name || '';
  if (mime.includes('pdf') || name.toLowerCase().endsWith('.pdf')) return '[PDF]';
  if (mime.includes('image')) return '[IMG]';
  return '[DOC]';
}

function helpTip(label, text) {
  return `<span class="help-tip" title="${esc(text)}">${esc(label)}</span>`;
}

function getDocumentKind(doc) {
  const mime = doc.mime_type || '';
  const name = (doc.name || doc.original_name || '').toLowerCase();
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('image')) return 'image';
  return 'other';
}

function buildDocumentDuplicateMap(docs) {
  const counts = new Map();

  docs.forEach((doc) => {
    const key = `${doc.file_path || ''}::${doc.original_name || doc.name || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function setDocumentFilter(filter) {
  documentFilter = filter;
  saveTriagePrefs();
  updateDocumentFilterButtons();
  loadDocuments();
}

function setDocumentScope(scope) {
  documentScope = scope;
  saveTriagePrefs();
  updateDocumentScopeButtons();
  loadDocuments();
}

function setDocumentSearch(value) {
  documentSearch = String(value || '').trim().toLowerCase();
  saveTriagePrefs();
  loadDocuments();
}

function clearDocumentSearch() {
  documentSearch = '';
  const input = document.getElementById('documentSearch');
  if (input) input.value = '';
  saveTriagePrefs();
  loadDocuments();
}

function setDocumentSort(value) {
  documentSort = value || 'newest';
  saveTriagePrefs();
  loadDocuments();
}

function isDocumentScopeSelected() {
  return documentScope === 'selected' && selectedProductId;
}

function getDocumentScopePath() {
  return isDocumentScopeSelected() ? `/documents?product_id=${selectedProductId}` : '/documents';
}

async function deferDocument(docId) {
  deferDocumentId(docId);
  await loadDocuments();
  setDocumentStatus(`Dokument #${docId} odlozen.`, 'ok');
}

async function undeferDocument(docId) {
  undeferDocumentId(docId);
  await loadDocuments();
  setDocumentStatus(`Dokument #${docId} vracen do fronty.`, 'ok');
}

async function undeferAllVisibleDocuments() {
  const docs = await apiGet(getDocumentScopePath());
  const visibleDeferredDocs = getVisibleDocumentsForCurrentView(docs)
    .filter((doc) => isDeferredDocument(doc.id));

  if (!visibleDeferredDocs.length) {
    setDocumentStatus('Žádné viditelné odložené dokumenty k vrácení.', 'ok');
    return;
  }

  visibleDeferredDocs.forEach((doc) => undeferDocumentId(doc.id));
  await loadDocuments();
  setDocumentStatus(`Vraceno do fronty: ${visibleDeferredDocs.length}.`, 'ok');
}

async function deferAllVisibleActionableDocuments() {
  const docs = await apiGet(getDocumentScopePath());
  const visibleActionableDocs = getVisibleDocumentsForCurrentView(docs)
    .filter((doc) => isActionableSuggestedDocument(doc) || isActionableUnsortedDocument(doc));

  if (!visibleActionableDocs.length) {
    setDocumentStatus('Žádné viditelné dokumenty k odložení.', 'ok');
    return;
  }

  visibleActionableDocs.forEach((doc) => deferDocumentId(doc.id));
  await loadDocuments();
  setDocumentStatus(`Odlozeno: ${visibleActionableDocs.length}.`, 'ok');
}

async function focusProductDocuments(productId, filter = 'all') {
  selectedProductId = Number(productId);
  documentScope = 'selected';
  documentFilter = filter;
  updateDocumentScopeButtons();
  updateDocumentFilterButtons();
  updateReceiptToolbar([]);
  await loadDocuments();
  await loadPhotos();
  await loadReceipts();
  await loadWatchFolderMedia();
  syncDiaryProductToSelection();
  await loadSelectedProductSummary();
  scrollToSection('documentsList');
}

function updateDocumentFilterButtons() {
  const ids = ['all', 'pdf', 'image', 'other', 'todo', 'suggested', 'unsorted', 'deferred'];
  ids.forEach((id) => {
    const btn = document.getElementById(`document-filter-${id}`);
    if (!btn) return;
    btn.classList.toggle('active', documentFilter === id);
  });
}

function updateDocumentScopeButtons() {
  ['selected', 'all'].forEach((scope) => {
    const btn = document.getElementById(`document-scope-${scope}`);
    if (!btn) return;
    btn.classList.toggle('active', documentScope === scope);
  });
}

function updateDocumentUnsortedTargetOptions() {
  const select = document.getElementById('document-unsorted-target');
  if (!select) return;
  const currentValue = select.value;
  const preferredValue = currentValue || lastManualDocumentProductId || selectedProductId || '';
  select.innerHTML = buildProductOptions(preferredValue);
  if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
    select.value = currentValue;
  } else if (lastManualDocumentProductId && Array.from(select.options).some((option) => Number(option.value) === Number(lastManualDocumentProductId))) {
    select.value = String(lastManualDocumentProductId);
  } else if (selectedProductId && Array.from(select.options).some((option) => Number(option.value) === Number(selectedProductId))) {
    select.value = String(selectedProductId);
  }
  saveTriagePrefs();
}

function updateDocumentVisibleTargetOptions() {
  const select = document.getElementById('document-visible-target');
  if (!select) return;
  const currentValue = select.value;
  const preferredValue = currentValue || lastManualDocumentProductId || selectedProductId || '';
  select.innerHTML = buildProductOptions(preferredValue);
  if (currentValue && Array.from(select.options).some((option) => option.value === currentValue)) {
    select.value = currentValue;
  } else if (lastManualDocumentProductId && Array.from(select.options).some((option) => Number(option.value) === Number(lastManualDocumentProductId))) {
    select.value = String(lastManualDocumentProductId);
  } else if (selectedProductId && Array.from(select.options).some((option) => Number(option.value) === Number(selectedProductId))) {
    select.value = String(selectedProductId);
  }
  saveTriagePrefs();
}

function setDocumentStatus(message, kind = '') {
  const el = document.getElementById('documentStatus');
  if (!el) return;
  el.className = `muted ${kind ? `status-${kind}` : ''}`.trim();
  el.textContent = message || '';
}

function buildProductOptions(selectedId) {
  const entries = Object.entries(productsMap);
  return entries.map(([id, name]) =>
    `<option value="${esc(id)}" ${String(selectedId) === String(id) ? 'selected' : ''}>${esc(name)}</option>`
  ).join('');
}

function suggestDocumentTarget(doc) {
  const haystack = normalizeProductKey([
    doc.name,
    doc.original_name,
    doc.file_path
  ].filter(Boolean).join(' '));

  const rules = [
    { keywords: ['fve', 'stridac', 'deye', 'solarni', 'panel'], target: 'FVE' },
    { keywords: ['okna', 'okno', 'dvere', 'sokol okna'], target: 'Svislá okna a dveře' },
    { keywords: ['stresni okna', 'stresni'], target: 'Stresni okna' },
    { keywords: ['zaluzie', 'rolety', 'stineni'], target: 'Stineni' },
    { keywords: ['podlahove topeni', 'podlahovka', 'rozdělovač', 'rozdelo', 'okruhy'], target: 'Podlahove topeni' },
    { keywords: ['anhydrit', 'zalivka', 'beton podlah', 'lite podlahy'], target: 'Podlahove souvrstvi' },
    { keywords: ['tepelne cerpadlo', 'tč', 'tc ', 'acond', 'ivt', 'stiebel', 'ctc', 'klimotop', 'pzp', 'reo heating', 'ac heating'], target: 'Tepelné čerpadlo' },
    { keywords: ['rekuperace', 'vzduchotechnika', 'nilan', 'regulus', 'zehnder', 'storc'], target: 'Rekuperacni jednotka' },
    { keywords: ['potrubi', 'vyustky', 'rozvody rekuperace'], target: 'Rozvody rekuperace' },
    { keywords: ['zakladova deska', 'dek konfigurator'], target: 'Zakladova deska' },
    { keywords: ['zdivo', 'cihly', 'wienerberger'], target: 'Zdivo' },
    { keywords: ['stropy', 'miako', 'spiroll', 'prefa'], target: 'Stropy' },
    { keywords: ['strecha', 'krytina'], target: 'Stresni plast' },
    { keywords: ['vodomerna sachta', 'pripojky', 'cetin', 'cez', 'vak', 'gridservices', 'site'], target: 'Inzenyrske site a pripojky' },
    { keywords: ['jimka', 'destova voda', 'destovka', 'retencni'], target: 'Destove hospodarstvi' },
    { keywords: ['zemni prace', 'rypadlo', 'dumper'], target: 'Zemni prace' }
  ];

  const match = rules.find((rule) => rule.keywords.some((keyword) => haystack.includes(normalizeProductKey(keyword))));
  if (!match) return null;

  const entry = Object.entries(productsMap).find(([, name]) => normalizeProductKey(name) === normalizeProductKey(match.target));
  if (!entry) return null;

  return { productId: Number(entry[0]), productName: entry[1] };
}

function buildSuggestedDocumentBuckets(docsWithSuggestion) {
  const buckets = new Map();

  docsWithSuggestion.forEach((doc) => {
    const suggestion = doc._suggestion;
    if (!isActionableSuggestedDocument(doc)) return;

    const key = String(suggestion.productId);
    if (!buckets.has(key)) {
      buckets.set(key, {
        productId: suggestion.productId,
        productName: suggestion.productName,
        count: 0,
        ids: []
      });
    }

    const bucket = buckets.get(key);
    bucket.count += 1;
    bucket.ids.push(doc.id);
  });

  return Array.from(buckets.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.productName).localeCompare(String(b.productName), 'cs');
  });
}

function buildCurrentDocumentBuckets(docs) {
  const buckets = new Map();
  docs.forEach((doc) => {
    const key = String(doc.product_id || '');
    const name = productsMap[doc.product_id] || `produkt #${doc.product_id}`;
    if (!buckets.has(key)) {
      buckets.set(key, { productId: doc.product_id, productName: name, count: 0 });
    }
    buckets.get(key).count += 1;
  });
  return Array.from(buckets.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return String(a.productName).localeCompare(String(b.productName), 'cs');
  });
}

function isActionableSuggestedDocument(doc) {
  return !isDeferredDocument(doc.id)
    && !!(doc._suggestion && Number(doc._suggestion.productId) !== Number(doc.product_id));
}

function isActionableUnsortedDocument(doc) {
  return !isDeferredDocument(doc.id) && !doc._suggestion;
}

function sortDocumentsForView(docs) {
  const items = [...docs];
  const nameOf = (doc) => String(doc.name || doc.original_name || '').toLowerCase();
  const createdOf = (doc) => new Date(doc.created_at || 0).getTime();
  const isSuggested = (doc) => !!(doc._suggestion && Number(doc._suggestion.productId) !== Number(doc.product_id));
  const isUnsorted = (doc) => !doc._suggestion;

  items.sort((a, b) => {
    if (documentSort === 'oldest') return createdOf(a) - createdOf(b);
    if (documentSort === 'name') return nameOf(a).localeCompare(nameOf(b), 'cs');
    if (documentSort === 'suggested-first') {
      if (isSuggested(a) !== isSuggested(b)) return isSuggested(a) ? -1 : 1;
      return createdOf(b) - createdOf(a);
    }
    if (documentSort === 'unsorted-first') {
      if (isUnsorted(a) !== isUnsorted(b)) return isUnsorted(a) ? -1 : 1;
      return createdOf(b) - createdOf(a);
    }
    return createdOf(b) - createdOf(a);
  });

  return items;
}

function getVisibleDocumentsForCurrentView(docs) {
  const docsWithSuggestion = docs.map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }));
  return sortDocumentsForView(docsWithSuggestion.filter((doc) => {
    const isDeferred = isDeferredDocument(doc.id);
    if (documentSearch) {
      const haystack = [
        doc.name,
        doc.original_name,
        doc.file_path
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(documentSearch)) return false;
    }
    if (documentFilter === 'deferred') return isDeferred;
    if (documentFilter === 'all') return true;
    if (documentFilter === 'todo') {
      return isActionableSuggestedDocument(doc) || isActionableUnsortedDocument(doc);
    }
    if (documentFilter === 'suggested') {
      return isActionableSuggestedDocument(doc);
    }
    if (documentFilter === 'unsorted') {
      return isActionableUnsortedDocument(doc);
    }
    return getDocumentKind(doc) === documentFilter;
  }));
}

async function loadDocuments() {
  const el = document.getElementById('documentsList');
  const summaryEl = document.getElementById('documentSummary');
  const suggestionsEl = document.getElementById('documentSuggestions');
  const triageSummaryEl = document.getElementById('documentTriageSummary');
  const workbenchEl = document.getElementById('documentWorkbench');
  if (!el) return;

  const docs = await apiGet(getDocumentScopePath());
  const docsWithSuggestion = docs.map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }));
  const pdfCount = docs.filter((doc) => getDocumentKind(doc) === 'pdf').length;
  const imageCount = docs.filter((doc) => getDocumentKind(doc) === 'image').length;
  const otherCount = docs.filter((doc) => getDocumentKind(doc) === 'other').length;
  const duplicateMap = buildDocumentDuplicateMap(docs);
  const suggestedCount = docsWithSuggestion.filter((doc) => doc._suggestion && Number(doc._suggestion.productId) !== Number(doc.product_id)).length;
  const duplicateCount = docs.filter((doc) => {
    const key = `${doc.file_path || ''}::${doc.original_name || doc.name || ''}`;
    return (duplicateMap.get(key) || 0) > 1;
  }).length;
  const deferredCount = docsWithSuggestion.filter((doc) => isDeferredDocument(doc.id)).length;
  const unsortedCount = docsWithSuggestion.filter((doc) => isActionableUnsortedDocument(doc)).length;
  const actionableSuggested = docsWithSuggestion.filter((doc) => isActionableSuggestedDocument(doc));
  const actionableUnsorted = docsWithSuggestion.filter((doc) => isActionableUnsortedDocument(doc));
  const suggestionBuckets = buildSuggestedDocumentBuckets(docsWithSuggestion);
  const currentBuckets = buildCurrentDocumentBuckets(docsWithSuggestion);
  const inWorkbench = isDocumentScopeSelected() && isProjectDocsWorkbench(selectedProductName());
  const visibleDocs = getVisibleDocumentsForCurrentView(docs);

  el.innerHTML = '';

  if (summaryEl) {
    summaryEl.textContent =
      `Dokumenty: ${docs.length} | viditelné: ${visibleDocs.length} | pdf: ${pdfCount} | obrázky: ${imageCount} | ostatní: ${otherCount} | duplicity: ${duplicateCount} | doporučené: ${suggestedCount} | bez návrhu: ${unsortedCount} | odložené: ${deferredCount} | scope: ${documentScope} | filtr: ${documentFilter} | hledani: ${documentSearch || '-'} | razeni: ${documentSort}`;
  }

  if (suggestionsEl) {
    if (!suggestionBuckets.length) {
      suggestionsEl.textContent = unsortedCount ? `Návrhy třídění: žádné. Bez návrhu: ${unsortedCount}.` : 'Návrhy třídění: žádné.';
    } else {
      suggestionsEl.innerHTML = `
        <div class="card">
          <b>Návrhy třídění</b>
          <div class="muted" style="margin-top:6px;">Bez návrhu: ${unsortedCount}</div>
          ${suggestionBuckets.map((bucket) => `
            <div style="margin-top:8px;">
              <div>${esc(bucket.productName)}: ${bucket.count}</div>
              <div class="row-actions">
                <button type="button" class="ghost-btn" onclick="moveSuggestedDocumentsToProduct(${bucket.productId}, ${JSON.stringify(bucket.productName)})">Presunout sem ${bucket.count}</button>
                <button type="button" class="ghost-btn" onclick="openSuggestedProduct(${bucket.productId}, ${JSON.stringify(bucket.productName)})">Otevrit produkt</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  }

  if (triageSummaryEl) {
    const currentTop = currentBuckets.slice(0, 5).map((bucket) => `${bucket.productName}: ${bucket.count}`).join(' | ');
    const targetTop = suggestionBuckets.slice(0, 5).map((bucket) => `${bucket.productName}: ${bucket.count}`).join(' | ');
    triageSummaryEl.textContent =
      `Rozložení: ${currentTop || '-'} | cílové přesuny: ${targetTop || '-'} | bez návrhu: ${unsortedCount} | odložené: ${deferredCount}`;
  }

  if (workbenchEl) {
    if (!inWorkbench) {
      workbenchEl.innerHTML = `${helpTip('Workbench třídění', 'Pracovní panel pro hromadné roztřídění projektové dokumentace do stavebních okruhů.')}: vyber okruh Projektová dokumentace RD.`;
    } else {
      const triageDone = docs.length - actionableSuggested.length - actionableUnsorted.length;
      const triagePct = docs.length ? Math.round((triageDone / docs.length) * 100) : 100;
      const workbenchDone = actionableSuggested.length === 0 && actionableUnsorted.length === 0;
      workbenchEl.innerHTML = `
        <div class="card">
          <b>${helpTip('Workbench třídění', 'Pracovní panel pro hromadné roztřídění projektové dokumentace do stavebních okruhů.')}</b>
          ${workbenchDone ? `<div class="muted" style="margin-top:6px;color:#0f766e;"><b>DONE: staging je dotříděný</b></div>` : ''}
          <div class="muted" style="margin-top:6px;">Ve stagingu: ${docs.length} | doporučené: ${actionableSuggested.length} | bez návrhu: ${actionableUnsorted.length} | odložené: ${deferredCount} | hotovo: ${triageDone}/${docs.length} (${triagePct}%)</div>
          <div class="muted" style="margin-top:6px;">Posledni ruční cíl: ${lastManualDocumentProductId ? esc(productsMap[lastManualDocumentProductId] || `produkt #${lastManualDocumentProductId}`) : 'zadny'}</div>
          <div class="row-actions" style="margin-top:8px;">
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('all')">Vše ve stagingu</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('todo')">Jen k řešení</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('suggested')">Jen doporučené</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('unsorted')">Jen bez návrhu</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('deferred')">Jen odložené</button>
          </div>
          <div class="row-actions" style="margin-top:8px;">
            <button type="button" class="ghost-btn" onclick="openNextSuggestedDocument()">Otevřít další doporučený</button>
            <button type="button" class="ghost-btn" onclick="openNextUnsortedDocument()">Otevřít další bez návrhu</button>
          </div>
          <div class="row-actions" style="margin-top:8px;">
            <button type="button" class="ghost-btn" onclick="moveNextSuggestedDocument()">Přesunout další doporučený</button>
            <button type="button" class="ghost-btn" onclick="moveNextUnsortedDocumentToLastTarget()">Zařadit další bez návrhu do posledního cíle</button>
            <button type="button" class="ghost-btn" onclick="deferNextActionableDocument()">Odložit další k řešení</button>
            <button type="button" class="ghost-btn" onclick="deferAllVisibleActionableDocuments()">Odlozit viditelné k řešení</button>
            <button type="button" class="ghost-btn" onclick="undeferAllVisibleDocuments()">Vratit viditelné odložené</button>
          </div>
        </div>
      `;
    }
  }

  if (!visibleDocs.length) {
    const label =
      documentFilter === 'pdf' ? 'Žádné PDF dokumenty.' :
      documentFilter === 'image' ? 'Žádné obrázkové dokumenty.' :
      documentFilter === 'other' ? 'Žádné ostatní dokumenty.' :
      documentFilter === 'todo' ? 'Žádné dokumenty k řešení.' :
      documentFilter === 'suggested' ? 'Žádné doporučené přesuny.' :
      documentFilter === 'unsorted' ? 'Žádné dokumenty bez návrhu.' :
      documentFilter === 'deferred' ? 'Žádné odložené dokumenty.' :
      documentSearch ? 'Hledani nic nenaslo.' :
      'Žádné dokumenty.';
    el.innerHTML = `<div class="muted">${label}</div>`;
    updateDocumentFilterButtons();
    updateDocumentScopeButtons();
    return;
  }

  visibleDocs.forEach((doc) => {
    const url = fileUrl(doc.file_path);
    const isPdf = (doc.mime_type || '').includes('pdf') || (doc.name || '').toLowerCase().endsWith('.pdf');
    const isImg = (doc.mime_type || '').includes('image');
    const shouldOpenEditor = openDocumentEditorId === doc.id;
    const docName = doc.name || doc.original_name || 'dokument';
    const absolutePath = `/data/uploads${doc.file_path}`;
    const createdAt = formatDateTime(doc.created_at || '-');
    const duplicateKey = `${doc.file_path || ''}::${doc.original_name || doc.name || ''}`;
    const isDuplicate = (duplicateMap.get(duplicateKey) || 0) > 1;
    const suggestion = doc._suggestion;
    const currentProductName = productsMap[doc.product_id] || `produkt #${doc.product_id}`;
    const isDeferred = isDeferredDocument(doc.id);

    const suggestedMove = suggestion && Number(suggestion.productId) !== Number(doc.product_id);
    const triageBadge = isDeferred
      ? helpTip('Odložené', 'Dokument je dočasně mimo pracovní frontu. Kdykoli ho můžeš vrátit zpět.')
      : inWorkbench && suggestedMove
      ? helpTip('Doporučený přesun', 'Aplikace odhadla cílový stavební okruh podle názvu souboru a cesty.')
      : inWorkbench && !suggestion
      ? helpTip('Ruční zařazení', 'Aplikace nenašla jistý cíl. Vyber stavební okruh ručně.')
      : '';

    el.innerHTML += `
      <div class="card document-card">
        <div class="document-main">
          <div class="document-title-row">
            <a href="#" onclick="openMediaViewer('${url}', '${esc(doc.mime_type || '')}');return false;"><b>${docIcon(doc)} ${esc(docName)}</b></a>
            <img src="${qrUrl(doc.id)}" class="mini-qr" alt="QR dokumentu">
          </div>
          <div class="document-badges">
            ${triageBadge}
            ${isDuplicate ? helpTip('Možná duplicita', 'Soubor vypadá podobně jako jiný už uložený dokument.') : ''}
            ${suggestedMove ? helpTip('Cíl návrhu', `Doporučeno přesunout do okruhu ${suggestion.productName}.`) : ''}
            ${!suggestion ? helpTip('Bez návrhu', 'Dokument zatím nemá automaticky rozpoznaný cílový okruh.') : ''}
          </div>
          <div class="document-meta">
            <span>Aktuálně: ${esc(currentProductName)}</span>
            ${suggestedMove ? `<span>Doporučeno: ${esc(suggestion.productName)}</span>` : ''}
            <span>${esc(doc.mime_type || '-')}</span>
            <span>Vytvořeno: ${esc(createdAt)}</span>
          </div>
          <div class="document-path">${esc(absolutePath)}</div>
        </div>

        ${!suggestion ? `
        <div class="document-quick-assign">
          <select id="document-quick-product-${doc.id}" aria-label="Cílový stavební okruh">
            ${buildProductOptions(lastManualDocumentProductId || doc.product_id)}
          </select>
          <button class="ghost-btn" onclick="moveDocumentToQuickProduct(${doc.id})">Zařadit</button>
        </div>
        ` : ''}

        <div class="document-actions">
          ${isPdf || isImg ? `<button class="ghost-btn" onclick="togglePreview(${doc.id})">Náhled</button>` : ''}
          <button class="ghost-btn" onclick="toggleDocumentEditor(${doc.id})">Upravit</button>
          ${suggestedMove ? `<button class="ghost-btn" onclick="moveDocumentToSuggestedProduct(${doc.id}, ${suggestion.productId}, ${JSON.stringify(suggestion.productName)})">Přesunout</button>` : ''}
          ${suggestedMove ? `<button class="ghost-btn" onclick="openSuggestedProduct(${suggestion.productId}, ${JSON.stringify(suggestion.productName)})">Otevřít cíl</button>` : ''}
          ${isDeferred ? `<button class="ghost-btn" onclick="undeferDocument(${doc.id})">Vrátit</button>` : `<button class="ghost-btn" onclick="deferDocument(${doc.id})">Odložit</button>`}
          <button class="ghost-btn danger-action" onclick="deleteDocument(${doc.id})">Smazat</button>
        </div>
        <div class="inline-tools">
          <button class="text-tool" onclick='copyText(${JSON.stringify(docName)}, "Název zkopírován.")'>Kopírovat název</button>
          <button class="text-tool" onclick='copyText(${JSON.stringify(absolutePath)}, "Cesta zkopírována.")'>Kopírovat cestu</button>
        </div>
        <div class="document-editor" style="display:${shouldOpenEditor ? 'block' : 'none'};">
          <label>Název dokumentu</label>
          <input id="document-name-${doc.id}" value="${esc(docName)}" placeholder="název dokumentu">
          <label>Cílový stavební okruh</label>
          <select id="document-product-${doc.id}">
            ${buildProductOptions(doc.product_id)}
          </select>
          <div class="row-actions">
            <button class="ghost-btn" onclick="saveDocumentName(${doc.id})">Uložit</button>
            <button class="ghost-btn" onclick="moveDocumentToSelectedProduct(${doc.id})">Přesunout na vybraný okruh</button>
          </div>
        </div>
        <div id="preview-${doc.id}" class="document-preview" style="display:none;">
          ${isPdf ? `<iframe src="${url}"></iframe>` : ''}
          ${isImg ? `<img src="${url}" alt="${esc(docName)}">` : ''}
        </div>
      </div>
    `;
  });

  openDocumentEditorId = null;
  updateDocumentFilterButtons();
  updateDocumentScopeButtons();
  updateDocumentUnsortedTargetOptions();
  updateDocumentVisibleTargetOptions();
  const sortSelect = document.getElementById('documentSort');
  if (sortSelect && sortSelect.value !== documentSort) sortSelect.value = documentSort;
}

async function moveAllSuggestedDocuments() {
  const docs = await apiGet(getDocumentScopePath());
  const candidates = docs
    .map((doc) => ({ doc, suggestion: suggestDocumentTarget(doc) }))
    .filter((item) => !isDeferredDocument(item.doc.id) && item.suggestion && Number(item.suggestion.productId) !== Number(item.doc.product_id));

  if (!candidates.length) {
    setDocumentStatus('Žádné doporučené přesuny.', 'ok');
    return;
  }

  let moved = 0;

  for (const item of candidates) {
    await apiPut(`/documents/${item.doc.id}`, {
      name: item.doc.name,
      product_id: item.suggestion.productId
    });
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  setDocumentStatus(`Presunuto doporučené: ${moved}.`, 'ok');
}

async function moveVisibleSuggestedDocuments() {
  const docs = await apiGet(getDocumentScopePath());
  const visibleDocs = getVisibleDocumentsForCurrentView(docs)
    .filter((doc) => isActionableSuggestedDocument(doc));

  if (!visibleDocs.length) {
    setDocumentStatus('Žádné viditelné doporučené dokumenty k přesunu.', 'ok');
    return;
  }

  let moved = 0;

  for (const doc of visibleDocs) {
    await apiPut(`/documents/${doc.id}`, {
      name: doc.name,
      product_id: doc._suggestion.productId
    });
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  setDocumentStatus(`Presunuto viditelné doporučené: ${moved}.`, 'ok');
}

async function copyVisibleDocumentsList() {
  const docs = await apiGet(getDocumentScopePath());
  const visibleDocs = getVisibleDocumentsForCurrentView(docs);

  if (!visibleDocs.length) {
    setDocumentStatus('Žádné viditelné dokumenty ke kopírování.', 'ok');
    return;
  }

  const lines = visibleDocs.map((doc, index) => {
    const suggestion = doc._suggestion;
    const current = productsMap[doc.product_id] || `produkt #${doc.product_id}`;
    const deferredTag = isDeferredDocument(doc.id) ? ' [ODLOZENO]' : '';
    const target = suggestion && Number(suggestion.productId) !== Number(doc.product_id)
      ? ` -> ${suggestion.productName}`
      : '';
    return `${index + 1}. ${doc.name || doc.original_name || 'dokument'}${deferredTag} | ${current}${target} | ${doc.file_path || ''}`;
  });

  await copyText(lines.join('\n'), `Zkopirovano ${visibleDocs.length} dokumentu.`);
}

async function moveAllUnsortedDocuments() {
  const select = document.getElementById('document-unsorted-target');
  const targetProductId = select?.value;

  if (!targetProductId) {
    setDocumentStatus('MISS: vyber cilovy produkt pro bez návrhu', 'miss');
    return;
  }

  const docs = await apiGet(getDocumentScopePath());
  const candidates = docs
    .map((doc) => ({ doc, suggestion: suggestDocumentTarget(doc) }))
    .filter((item) => !isDeferredDocument(item.doc.id) && !item.suggestion && Number(item.doc.product_id) !== Number(targetProductId));

  if (!candidates.length) {
    setDocumentStatus('Žádné dokumenty bez návrhu k zařazení.', 'ok');
    return;
  }

  lastManualDocumentProductId = Number(targetProductId);
  saveTriagePrefs();
  let moved = 0;

  for (const item of candidates) {
    await apiPut(`/documents/${item.doc.id}`, {
      name: item.doc.name,
      product_id: targetProductId
    });
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  const targetName = productsMap[targetProductId] || 'vybraneho produktu';
  setDocumentStatus(`Zarazeno bez návrhu do ${targetName}: ${moved}.`, 'ok');
}

async function moveVisibleDocumentsToTarget() {
  const select = document.getElementById('document-visible-target');
  const targetProductId = select?.value;

  if (!targetProductId) {
    setDocumentStatus('MISS: vyber cilovy produkt pro viditelné dokumenty', 'miss');
    return;
  }

  const docs = await apiGet(getDocumentScopePath());
  const visibleDocs = getVisibleDocumentsForCurrentView(docs)
    .filter((doc) => !isDeferredDocument(doc.id) && Number(doc.product_id) !== Number(targetProductId));

  if (!visibleDocs.length) {
    setDocumentStatus('Žádné viditelné dokumenty k zařazení.', 'ok');
    return;
  }

  lastManualDocumentProductId = Number(targetProductId);
  let moved = 0;

  for (const doc of visibleDocs) {
    await apiPut(`/documents/${doc.id}`, {
      name: doc.name,
      product_id: targetProductId
    });
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  const targetName = productsMap[targetProductId] || 'vybraneho produktu';
  setDocumentStatus(`Zarazeno viditelné do ${targetName}: ${moved}.`, 'ok');
}

async function moveSuggestedDocumentsToProduct(productId, productName) {
  const docs = await apiGet(getDocumentScopePath());
  const candidates = docs
    .map((doc) => ({ doc, suggestion: suggestDocumentTarget(doc) }))
    .filter((item) => !isDeferredDocument(item.doc.id) && item.suggestion && Number(item.suggestion.productId) === Number(productId) && Number(item.doc.product_id) !== Number(productId));

  if (!candidates.length) {
    setDocumentStatus(`Žádné dokumenty k přesunu do ${productName}.`, 'ok');
    return;
  }

  let moved = 0;

  for (const item of candidates) {
    await apiPut(`/documents/${item.doc.id}`, {
      name: item.doc.name,
      product_id: item.suggestion.productId
    });
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  setDocumentStatus(`Presunuto do ${productName}: ${moved}.`, 'ok');
}

async function openSuggestedProduct(productId, productName) {
  await focusProductDocuments(productId, 'all');
  setDocumentStatus(`Otevren produkt ${productName}.`, 'ok');
}

async function openNextSuggestedDocument() {
  const docs = await apiGet(getDocumentScopePath());
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableSuggestedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Žádný další doporučený dokument.', 'ok');
    return;
  }

  documentFilter = 'suggested';
  openDocumentEditorId = candidate.id;
  await loadDocuments();
  scrollToSection('documentsList');
  setDocumentStatus(`Otevren doporuceny dokument #${candidate.id}.`, 'ok');
}

async function openNextUnsortedDocument() {
  const docs = await apiGet(getDocumentScopePath());
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableUnsortedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Žádný další dokument bez návrhu.', 'ok');
    return;
  }

  documentFilter = 'unsorted';
  openDocumentEditorId = candidate.id;
  await loadDocuments();
  scrollToSection('documentsList');
  setDocumentStatus(`Otevren dokument bez návrhu #${candidate.id}.`, 'ok');
}

async function moveNextSuggestedDocument() {
  const docs = await apiGet(getDocumentScopePath());
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableSuggestedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Žádný další doporučený dokument k přesunu.', 'ok');
    return;
  }

  await moveDocumentToSuggestedProduct(candidate.id, candidate._suggestion.productId, candidate._suggestion.productName);
}

async function moveNextUnsortedDocumentToLastTarget() {
  if (!lastManualDocumentProductId) {
    setDocumentStatus('MISS: zatím není posledni ruční cíl', 'miss');
    return;
  }

  const docs = await apiGet(getDocumentScopePath());
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableUnsortedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Žádný další dokument bez návrhu k zařazení.', 'ok');
    return;
  }

  const result = await apiPut(`/documents/${candidate.id}`, {
    name: candidate.name,
    product_id: lastManualDocumentProductId
  });
  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  setDocumentStatus(`Dokument #${candidate.id} zarazen do ${(result?.document && productsMap[result.document.product_id]) || 'posledního cíle'}.`, 'ok');
  await continueWorkbenchQueue('unsorted');
}

async function deferNextActionableDocument() {
  const docs = await apiGet(getDocumentScopePath());
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableSuggestedDocument(doc) || isActionableUnsortedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Žádný další dokument k odložení.', 'ok');
    return;
  }

  deferDocumentId(candidate.id);
  await loadDocuments();
  setDocumentStatus(`Dokument #${candidate.id} odlozen.`, 'ok');
  await continueWorkbenchQueue();
}

async function continueWorkbenchQueue(prefer = null) {
  const inWorkbench = documentScope === 'selected' && selectedProductId && isProjectDocsWorkbench(selectedProductName());
  if (!inWorkbench) return;

  if (prefer === 'suggested') {
    await openNextSuggestedDocument();
    return;
  }

  if (prefer === 'unsorted') {
    await openNextUnsortedDocument();
    return;
  }

  const path = `/documents?product_id=${selectedProductId}`;
  const docs = await apiGet(path);
  const docsWithSuggestion = docs.map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }));
  const nextSuggested = docsWithSuggestion.find((doc) => isActionableSuggestedDocument(doc));
  if (nextSuggested) {
    documentFilter = 'suggested';
    openDocumentEditorId = nextSuggested.id;
    await loadDocuments();
    scrollToSection('documentsList');
    setDocumentStatus(`Pokracuj: doporuceny dokument #${nextSuggested.id}.`, 'ok');
    return;
  }

  const nextUnsorted = docsWithSuggestion.find((doc) => isActionableUnsortedDocument(doc));
  if (nextUnsorted) {
    documentFilter = 'unsorted';
    openDocumentEditorId = nextUnsorted.id;
    await loadDocuments();
    scrollToSection('documentsList');
    setDocumentStatus(`Pokracuj: dokument bez návrhu #${nextUnsorted.id}.`, 'ok');
    return;
  }

  setDocumentStatus('Workbench je dotrideny.', 'ok');
}

function toggleDocumentEditor(id) {
  openDocumentEditorId = openDocumentEditorId === id ? null : id;
  loadDocuments();
}

async function saveDocumentName(id) {
  const input = document.getElementById(`document-name-${id}`);
  const productInput = document.getElementById(`document-product-${id}`);
  if (!input) return;

  try {
    await apiPut(`/documents/${id}`, {
      name: input.value,
      product_id: productInput ? productInput.value : undefined
    });
    openDocumentEditorId = null;
    await loadDocuments();
    await loadProducts();
    await loadSelectedProductSummary();
    setDocumentStatus(`Dokument #${id} ulozen.`, 'ok');
  } catch (e) {
    setDocumentStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function moveDocumentToSelectedProduct(id) {
  if (!selectedProductId) {
    setDocumentStatus('MISS: nejdriv vyber stavebni okruh', 'miss');
    return;
  }

  const nameInput = document.getElementById(`document-name-${id}`);

  try {
    await apiPut(`/documents/${id}`, {
      name: nameInput ? nameInput.value : undefined,
      product_id: selectedProductId
    });
    openDocumentEditorId = null;
    await loadDocuments();
    await loadProducts();
    await loadSelectedProductSummary();
    setDocumentStatus(`Dokument #${id} přesunut na produkt ${selectedProductName()}.`, 'ok');
    await continueWorkbenchQueue();
  } catch (e) {
    setDocumentStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function moveDocumentToSuggestedProduct(id, productId, productName) {
  const nameInput = document.getElementById(`document-name-${id}`);

  try {
    await apiPut(`/documents/${id}`, {
      name: nameInput ? nameInput.value : undefined,
      product_id: productId
    });
    openDocumentEditorId = null;
    await loadDocuments();
    await loadProducts();
    await loadSelectedProductSummary();
    setDocumentStatus(`Dokument #${id} přesunut do ${productName}.`, 'ok');
    await continueWorkbenchQueue('suggested');
  } catch (e) {
    setDocumentStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function moveDocumentToQuickProduct(id) {
  const productInput = document.getElementById(`document-quick-product-${id}`);
  const nameInput = document.getElementById(`document-name-${id}`);
  if (!productInput?.value) {
    setDocumentStatus('MISS: vyber cilovy produkt', 'miss');
    return;
  }

  try {
    lastManualDocumentProductId = Number(productInput.value);
    saveTriagePrefs();
    const result = await apiPut(`/documents/${id}`, {
      name: nameInput ? nameInput.value : undefined,
      product_id: productInput.value
    });
    await loadDocuments();
    await loadProducts();
    await loadSelectedProductSummary();
    setDocumentStatus(`Dokument #${id} zarazen do ${(result?.document && productsMap[result.document.product_id]) || 'vybraneho produktu'}.`, 'ok');
    await continueWorkbenchQueue('unsorted');
  } catch (e) {
    setDocumentStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

function togglePreview(id) {
  const el = document.getElementById(`preview-${id}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function deleteDocument(id) {
  await apiDelete(`/documents/${id}`);
  await loadDocuments();
  await loadSelectedProductSummary();
  setDocumentStatus(`Dokument #${id} smazan.`, 'ok');
}

async function uploadDocument(e) {
  e.preventDefault();

  if (!selectedProductId) return alert('Vyber stavebn? okruh');
  const filesInput = document.getElementById('documentFile');
  const folderInput = document.getElementById('documentFolder');
  const customNameInput = document.getElementById('documentName');
  const files = [
    ...Array.from(filesInput?.files || []),
    ...Array.from(folderInput?.files || [])
  ];
  if (!files.length) return alert('Vyber soubor nebo slozku');

  const fd = new FormData();
  fd.append('product_id', selectedProductId);
  if (customNameInput?.value?.trim() && files.length === 1) {
    fd.append('name', customNameInput.value.trim());
  }
  files.forEach((file) => {
    fd.append('files', file);
  });

  const response = await fetch(apiUrl('/documents/upload'), {
    method: 'POST',
    headers: authHeaders(),
    body: fd
  });

  if (!response.ok) {
    throw new Error(`POST /documents/upload HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.success) {
    throw new Error('POST /documents/upload invalid response');
  }

  document.getElementById('documentFile').value = '';
  document.getElementById('documentFolder').value = '';
  document.getElementById('documentName').value = '';
  await loadDocuments();
  await loadSelectedProductSummary();
  setDocumentStatus(`Nahrano: ${payload.uploaded || files.length} dokumentu.`, 'ok');
}

function calcWarrantyUntil(date, months) {
  if (!date || !months) return '';
  const d = new Date(date);
  d.setMonth(d.getMonth() + parseInt(months || 0, 10));
  return d.toISOString().split('T')[0];
}

function bindWarrantyAuto(id) {
  const dateEl = document.getElementById(`receipt-date-${id}`);
  const monthsEl = document.getElementById(`receipt-warranty-months-${id}`);
  const untilEl = document.getElementById(`receipt-warranty-until-${id}`);

  if (!dateEl || !monthsEl || !untilEl) return;

  const update = () => {
    untilEl.value = calcWarrantyUntil(dateEl.value, monthsEl.value);
  };

  dateEl.addEventListener('input', update);
  monthsEl.addEventListener('input', update);
  update();
}

function getWarrantyStatus(date) {
  if (!date) return { label: 'nezname', color: '#999' };

  const now = new Date();
  const warrantyDate = new Date(date);
  const diff = (warrantyDate - now) / (1000 * 60 * 60 * 24 * 30);

  if (diff < 0) return { label: 'po zaruce', color: 'red' };
  if (diff < 3) return { label: 'konci', color: 'orange' };
  return { label: 'v zaruce', color: 'green' };
}

function setReceiptFilter(filter) {
  receiptFilter = filter;
  updateReceiptToolbar([]);
  loadReceipts();
}

function filterWarranty(receipt) {
  if (!receipt.warranty_until) return true;

  const now = new Date();
  const warrantyDate = new Date(receipt.warranty_until);
  const diff = (warrantyDate - now) / (1000 * 60 * 60 * 24 * 30);

  if (receiptFilter === 'green') return diff >= 3;
  if (receiptFilter === 'orange') return diff < 3 && diff >= 0;
  if (receiptFilter === 'red') return diff < 0;
  return true;
}

function filterReceiptSearch(receipt) {
  if (!receiptSearch) return true;
  const haystack = [
    receipt.title,
    receipt.original_name,
    receipt.supplier,
    receipt.document_number,
    receipt.purchase_date,
    receipt.date,
    productsMap[receipt.product_id]
  ].join(' ').toLowerCase();
  return haystack.includes(receiptSearch);
}

async function loadWarrantyDashboard() {
  const el = document.getElementById('warrantyDashboard');
  if (!el) return;

  const receipts = await apiGet('/receipts');
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);

  const items = receipts.filter((receipt) => {
    if (!receipt.warranty_until) return false;
    const warrantyDate = new Date(receipt.warranty_until);
    return warrantyDate <= limit && warrantyDate >= now;
  });

  if (!items.length) {
    el.innerHTML = '<div class="muted">Žádné záruky ke sledování.</div>';
    return;
  }

  el.innerHTML = items.map((receipt) => {
    const url = fileUrl(receipt.file_path);
    return `
      <div class="card">
        <a href="#" onclick="openMediaViewer('${url}', 'application/pdf');return false;">
          [!] ${esc(receipt.title || receipt.original_name)}
        </a>
        <small> -> konci: ${esc(receipt.warranty_until)}</small>
      </div>
    `;
  }).join('');
}

async function loadWarrantyAlerts() {
  const el = document.getElementById('warrantyAlerts');
  if (!el) return;

  const receipts = await apiGet('/receipts');
  const now = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + 7);

  const alerts = receipts.filter((receipt) => {
    if (!receipt.warranty_until) return false;
    const warrantyDate = new Date(receipt.warranty_until);
    return warrantyDate <= limit && warrantyDate >= now;
  });

  if (!alerts.length) {
    el.innerHTML = '<small>Žádné končící záruky</small>';
    return;
  }

  el.innerHTML = alerts.map((receipt) => {
    const url = fileUrl(receipt.file_path);
    return `
      <div class="card">
        [!] <a href="#" onclick="openMediaViewer('${url}', 'application/pdf');return false;">
          ${esc(receipt.title || receipt.original_name)}
        </a>
        <small> konci: ${esc(receipt.warranty_until)}</small>
      </div>
    `;
  }).join('');
}

async function loadWatcherMinimum() {
  const summaryEl = document.getElementById('watcherSummary');
  const listEl = document.getElementById('watcherList');
  if (!summaryEl || !listEl) return;

  const watcher = await apiGet('/watcher');
  const blocks = [
    {
      label: 'Media v inboxu',
      items: watcher.groups?.inbox_media || [],
      value: (r) => `${mediaBadge(r.media_kind, r.mime_type)} ${r.filename} -> ${r.mime_type || 'media'}`
    },
    {
      label: 'OCR ke kontrole',
      items: watcher.groups?.review_needed || [],
      value: (r) => `${r.title || r.original_name || `receipt #${r.id}`} -> ${r.ocr_status || 'review_needed'}`
    },
    {
      label: 'Konci do 30 dni',
      items: watcher.groups?.ending_soon || [],
      value: (r) => `${r.title || r.original_name || `receipt #${r.id}`} -> ${r.warranty_until || '-'}`
    },
    {
      label: 'Chybí dodavatel',
      items: watcher.groups?.missing_supplier || [],
      value: (r) => r.title || r.original_name || `receipt #${r.id}`
    },
    {
      label: 'Chybí číslo dokladu',
      items: watcher.groups?.missing_document_number || [],
      value: (r) => r.title || r.original_name || `receipt #${r.id}`
    },
    {
      label: 'Chybí datum nákupu',
      items: watcher.groups?.missing_purchase_date || [],
      value: (r) => r.title || r.original_name || `receipt #${r.id}`
    }
  ];

  const totalFlags =
    (watcher.counts?.inbox_media || 0) +
    (watcher.counts?.review_needed || 0) +
    (watcher.counts?.ending_soon || 0) +
    (watcher.counts?.missing_supplier || 0) +
    (watcher.counts?.missing_document_number || 0) +
    (watcher.counts?.missing_purchase_date || 0);

  summaryEl.textContent =
    `Watcher: ${totalFlags} flagu | inbox: ${watcher.counts?.inbox_media || 0} | review: ${watcher.counts?.review_needed || 0} | warranty: ${watcher.counts?.ending_soon || 0}`;

  if (!totalFlags) {
    listEl.innerHTML = `
      <div class="card muted">
        Watcher je cisty. Žádný problem k řešení.
        <div class="row-actions" style="margin-top:8px;">
          <button class="ghost-btn" onclick="approveAllReviewNeeded()">Schvalit vse review_needed</button>
        </div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = blocks
    .filter((block) => block.items.length)
    .map((block) => `
      <div class="card">
        <b>${block.label}</b>
        <div class="muted">Pocet: ${block.items.length}</div>
        ${block.label === 'OCR ke kontrole' ? `<div class="row-actions" style="margin-top:8px;"><button class="ghost-btn" onclick="approveAllReviewNeeded()">Schvalit vse review_needed</button></div>` : ''}
        ${block.items.slice(0, 5).map((item) => `
          <div style="margin-top:6px;">
            <div>${esc(block.value(item))}</div>
            <div class="row-actions">
              ${item.id ? `<button class="ghost-btn" onclick="focusReceiptFromWatcher(${item.id}, ${item.product_id || 'null'})">Otevrit receipt</button>` : ''}
              ${item.id ? `<button class="ghost-btn" onclick="runReceiptOcrMinimum(${item.id})">OCR minimum</button>` : ''}
              ${item.id ? `<button class="ghost-btn" onclick="approveReceiptOcr(${item.id})">Schvalit OCR</button>` : ''}
              ${item.filename ? `<button class="ghost-btn" onclick="focusWatchFolder()">Otevrit inbox</button>` : ''}
              ${item.filename ? `<button class="ghost-btn" onclick='deleteWatchFolderMedia(${JSON.stringify(item.filename)})'>Smazat z inboxu</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `)
    .join('');
}

async function approveAllReviewNeeded() {
  try {
    const payload = await apiPost('/receipts/ocr-approve-all-review-needed');
    await loadReceipts();
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
    setReceiptStatus(`Batch OCR approve hotovo. Upraveno: ${payload.updated || 0}`, 'ok');
  } catch (e) {
    setReceiptStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function focusReceiptFromWatcher(receiptId, productId) {
  if (productId) {
    selectedProductId = productId;
  }

  focusedReceiptId = receiptId;
  openReceiptEditorId = receiptId;
  updateReceiptToolbar([]);
  await loadReceipts();

  const target = document.getElementById(`receipt-card-${receiptId}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setReceiptStatus(`Watcher otevrel receipt #${receiptId}.`, 'ok');
}

async function focusSelectedReceiptIssue(mode) {
  if (!selectedProductId) {
    setReceiptStatus('MISS: nejdriv vyber stavebni okruh', 'miss');
    return;
  }

  const receipts = await apiGet(`/receipts?product_id=${selectedProductId}`);
  const matchers = {
    pending: (item) => item.status !== 'ready',
    review: (item) => item.ocr_status === 'review_needed',
    missing_document_number: (item) => !item.document_number,
    missing_supplier: (item) => !(item.supplier || item.vendor),
    missing_purchase_date: (item) => !(item.purchase_date || item.date)
  };

  const matcher = matchers[mode];
  if (!matcher) return;

  const receipt = receipts.find(matcher);
  if (!receipt) {
    setReceiptStatus(`Nic k řešení pro filtr ${mode}.`, 'ok');
    return;
  }

  focusedReceiptId = receipt.id;
  openReceiptEditorId = receipt.id;
  receiptFilter = 'all';
  await loadReceipts();

  const target = document.getElementById(`receipt-card-${receipt.id}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setReceiptStatus(`Otevren receipt #${receipt.id} pro ${mode}.`, 'ok');
}

function qrUrl(id) {
  const base = window.location.origin;
  const data = encodeURIComponent(base + '/receipt/' + id);
  return apiUrl(`/qr?size=80&data=${data}`);
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mediaBadge(kind, mimeType = '') {
  if (kind === 'video' || String(mimeType).startsWith('video/')) return '[VID]';
  if (kind === 'image' || String(mimeType).startsWith('image/')) return '[IMG]';
  return '[FILE]';
}

function focusWatchFolder() {
  const target = document.getElementById('watchFolderMedia');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  loadWatchFolderMedia();
}

function openMediaViewer(url, mimeType = '') {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const video = document.getElementById('lightboxVideo');
  if (!lb || !img || !video) return;

  const isVideo = String(mimeType || '').startsWith('video/');

  if (isVideo) {
    img.style.display = 'none';
    img.src = '';
    video.style.display = 'block';
    video.src = url;
  } else {
    video.pause();
    video.style.display = 'none';
    video.src = '';
    img.style.display = 'block';
    img.src = url;
  }

  lb.style.display = 'flex';
}

function parseOcrRaw(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function formatOcrSummary(receipt) {
  const ocr = parseOcrRaw(receipt.ocr_raw_json);
  if (!ocr) return '';

  const parts = [];
  if (ocr.document_number_candidate) parts.push(`doklad ${ocr.document_number_candidate}`);
  if (ocr.purchase_date_candidate) parts.push(`datum ${ocr.purchase_date_candidate}`);
  if (ocr.warranty_until_candidate) parts.push(`zaruka do ${ocr.warranty_until_candidate}`);

  if (!parts.length) return 'OCR minimum nic rozumneho nenaslo.';
  return `OCR navrh: ${parts.join(' | ')}`;
}

function receiptOcrStage(receipt) {
  const status = receipt.ocr_status || 'not_processed';
  if (status === 'approved') return { pct: 100, label: 'OCR schváleno', className: 'ok' };
  if (status === 'review_needed') return { pct: 65, label: 'OCR čeká na kontrolu', className: 'review' };
  if (status === 'not_processed' || !status) return { pct: 15, label: 'OCR zatím neproběhlo', className: 'idle' };
  return { pct: 35, label: `OCR: ${status}`, className: 'review' };
}

function toggleReceiptDetails(id) {
  const el = document.getElementById(`receipt-details-${id}`);
  if (el) el.hidden = !el.hidden;
}

async function loadReceipts() {
  const el = document.getElementById('receiptsList');
  if (!el) return;

  const path = selectedProductId ? `/receipts?product_id=${selectedProductId}` : '/receipts';
  const receipts = await apiGet(path);
  const visibleReceipts = receipts.filter(filterWarranty).filter(filterReceiptSearch);

  el.innerHTML = '';
  updateReceiptToolbar(visibleReceipts);
  setReceiptStatus('');

  if (!visibleReceipts.length) {
    el.innerHTML = '<div class="card muted">Žádné faktury pro aktuální filtr.</div>';
    return;
  }

  visibleReceipts.forEach((receipt) => {
    const url = fileUrl(receipt.file_path);
    const name = receipt.title || receipt.original_name || receipt.file_path;
    const warranty = getWarrantyStatus(receipt.warranty_until);
    const isPdf = (receipt.mime_type || '').includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const isImg = (receipt.mime_type || '').includes('image');
    const shouldHighlight = focusedReceiptId === receipt.id;
    const shouldOpenEditor = openReceiptEditorId === receipt.id;
    const ocrSummary = formatOcrSummary(receipt);
    const absolutePath = `/data${receipt.file_path}`;
    const createdAt = formatDateTime(receipt.created_at || '-');
    const ocrStage = receiptOcrStage(receipt);

    el.innerHTML += `
      <div class="card receipt-card" id="receipt-card-${receipt.id}" style="${shouldHighlight ? 'border:2px solid #0f766e;' : ''}">
        <div class="receipt-head">
          <a href="#" onclick="openMediaViewer('${url}', '${esc(receipt.mime_type || '')}');return false;"><b>${docIcon(receipt)} ${esc(name)}</b></a>
          <button type="button" class="icon-btn" onclick="toggleReceiptDetails(${receipt.id})" title="Zobrazit podrobnosti">ⓘ</button>
          <img src="${qrUrl(receipt.id)}" class="mini-qr receipt-qr" alt="QR faktury">
        </div>
        ${receipt.warranty_until ? `<span style="margin-left:10px;padding:2px 6px;border-radius:6px;background:${warranty.color};color:white;font-size:12px;">${warranty.label}</span>` : ''}
        <div class="receipt-meta-grid">
          <span>Dodavatel: ${esc(receipt.supplier || '-')}</span>
          <span>Doklad: ${esc(receipt.document_number || '-')}</span>
          <span>Datum nákupu / převzetí: ${esc(receipt.purchase_date || '-')}</span>
          <span>Částka: ${esc(receipt.total_amount || '-')}</span>
        </div>
        <div class="ocr-progress ${ocrStage.className}" title="${esc(ocrStage.label)}">
          <span style="width:${ocrStage.pct}%;"></span>
        </div>
        <div class="muted">${esc(ocrStage.label)} | Stav dokladu: ${esc(receipt.status || 'pending_review')}</div>
        <div id="receipt-details-${receipt.id}" class="receipt-details" hidden>
          <div class="muted">Vytvořeno: ${esc(createdAt)} | Cesta: ${esc(absolutePath)}</div>
          <div class="muted">Záruka se počítá z pole Datum nákupu / převzetí, ne z data nahrání. OCR minimum je zatím jen rychlý návrh z názvu souboru; cílově má OCR hledat datum nákupu, dodání nebo převzetí přímo v dokladu.</div>
        </div>
        ${ocrSummary ? `<div class="muted">${esc(ocrSummary)}</div>` : ''}
        <div class="row-actions">
          ${isPdf || isImg ? `<button class="ghost-btn" title="Otevře PDF nebo obrázek dokladu přímo v aplikaci." onclick="togglePreview('receipt-${receipt.id}')">Náhled</button>` : ''}
          <button class="ghost-btn" title="Spustí dočasné OCR minimum. Teď hledá hlavně údaje z názvu souboru; plné OCR přijde v další fázi." onclick="runReceiptOcrMinimum(${receipt.id})">OCR návrh</button>
          <button class="ghost-btn" title="Potvrdí nalezený OCR návrh a označí ho jako schválený." onclick="approveReceiptOcr(${receipt.id})">Schválit OCR</button>
          <button onclick="togglePreview('receipt-edit-${receipt.id}')">Upravit</button>
          <button class="ghost-btn" title="Zkopíruje název pro rychlé vložení do mailu, poznámky nebo vyhledávání." onclick='copyText(${JSON.stringify(name)}, "Název zkopírován.")'>Kopírovat název</button>
          <button class="ghost-btn" title="Zkopíruje číslo dokladu pro párování s platbou nebo komunikaci s dodavatelem." onclick='copyText(${JSON.stringify(receipt.document_number || '')}, "Číslo dokladu zkopírováno.")'>Kopírovat doklad</button>
          <button class="ghost-btn" title="Zkopíruje interní cestu k souboru na NAS." onclick='copyText(${JSON.stringify(absolutePath)}, "Cesta zkopírována.")'>Kopírovat cestu</button>
          <button class="ghost-btn" onclick="deleteReceipt(${receipt.id})">Smazat</button>
        </div>

        <div id="preview-receipt-edit-${receipt.id}" class="receipt-editor" style="display:${shouldOpenEditor ? 'block' : 'none'};">
          <label>Název dokladu</label>
          <input id="receipt-title-${receipt.id}" value="${esc(receipt.title)}" placeholder="např. faktura Alza"><br>
          <label>Dodavatel</label>
          <input id="receipt-supplier-${receipt.id}" value="${esc(receipt.supplier)}" placeholder="např. Alza.cz"><br>
          <label>Číslo dokladu</label>
          <input id="receipt-number-${receipt.id}" value="${esc(receipt.document_number)}" placeholder="číslo faktury / účtenky"><br>
          <label>Datum nákupu / převzetí pro výpočet záruky</label>
          <input id="receipt-date-${receipt.id}" value="${esc(receipt.purchase_date)}" type="date"><br>
          <label>Částka</label>
          <input id="receipt-total-${receipt.id}" value="${esc(receipt.total_amount)}" type="number" step="0.01" placeholder="částka"><br>
          <label>Délka záruky v měsících</label>
          <input id="receipt-warranty-months-${receipt.id}" value="${esc(receipt.warranty_months)}" type="number" placeholder="např. 24"><br>
          <label>Záruka do</label>
          <input id="receipt-warranty-until-${receipt.id}" value="${esc(receipt.warranty_until)}" type="date"><br>
          <label>Poznámka k záruce</label>
          <input id="receipt-warranty-note-${receipt.id}" value="${esc(receipt.warranty_note)}" placeholder="např. prodloužená záruka"><br>
          <button onclick="saveReceipt(${receipt.id})">Ulozit</button>
        </div>

        <div id="preview-receipt-${receipt.id}" style="display:none;">
          ${isPdf ? `<iframe src="${url}" style="width:100%;height:400px;"></iframe>` : ''}
          ${isImg ? `<img src="${url}" style="max-width:100%;">` : ''}
        </div>
      </div>
    `;
  });

  visibleReceipts.forEach((receipt) => bindWarrantyAuto(receipt.id));
  focusedReceiptId = null;
  openReceiptEditorId = null;
}

async function saveReceipt(id) {
  try {
    await apiPut(`/receipts/${id}`, {
      title: document.getElementById(`receipt-title-${id}`).value,
      supplier: document.getElementById(`receipt-supplier-${id}`).value,
      document_number: document.getElementById(`receipt-number-${id}`).value,
      purchase_date: document.getElementById(`receipt-date-${id}`).value,
      total_amount: document.getElementById(`receipt-total-${id}`).value,
      warranty_months: document.getElementById(`receipt-warranty-months-${id}`).value,
      warranty_until: document.getElementById(`receipt-warranty-until-${id}`).value,
      warranty_note: document.getElementById(`receipt-warranty-note-${id}`).value
    });
    await loadReceipts();
    await loadBudget();
    setReceiptStatus(`Receipt #${id} ulozen.`, 'ok');
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
  } catch (e) {
    setReceiptStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function deleteReceipt(id) {
  try {
    await apiDelete(`/receipts/${id}`);
    await loadReceipts();
    await loadBudget();
    setReceiptStatus(`Receipt #${id} smazan.`, 'ok');
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
  } catch (e) {
    setReceiptStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function uploadReceipt(e) {
  e.preventDefault();

  const file = document.getElementById('receiptFile').files[0];
  if (!file) return alert('Vyber soubor');

  const fd = new FormData();
  fd.append('title', document.getElementById('receiptTitle').value || file.name);
  if (selectedProductId) fd.append('product_id', selectedProductId);
  fd.append('file', file);

  try {
    const response = await fetch(apiUrl('/receipts/upload'), {
      method: 'POST',
      headers: authHeaders(),
      body: fd
    });
    await parseJsonResponse(response, 'POST /receipts/upload');
    document.getElementById('receiptTitle').value = '';
    document.getElementById('receiptFile').value = '';
    await loadReceipts();
    await loadBudget();
    setReceiptStatus('Receipt nahran.', 'ok');
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
  } catch (e) {
    setReceiptStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function runReceiptOcrMinimum(id) {
  try {
    await apiPost(`/receipts/${id}/ocr-minimum`);
    await loadReceipts();
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
    setReceiptStatus(`OCR minimum hotovo pro receipt #${id}.`, 'ok');
  } catch (e) {
    setReceiptStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function approveReceiptOcr(id) {
  try {
    await apiPost(`/receipts/${id}/ocr-approve`);
    await loadReceipts();
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
    setReceiptStatus(`OCR schvaleno pro receipt #${id}.`, 'ok');
  } catch (e) {
    setReceiptStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function loadPhotos() {
  const el = document.getElementById('photosGrid');
  const summaryEl = document.getElementById('photoSummary');
  if (!el) return;

  if (!selectedProductId) {
    el.innerHTML = '';
    if (summaryEl) summaryEl.textContent = 'Media summary: vyber produkt';
    updateMediaFilterButtons();
    return;
  }

  const photos = await apiGet(`/photos?product_id=${selectedProductId}`);
  const imageCount = photos.filter((photo) => photo.media_kind === 'image').length;
  const videoCount = photos.filter((photo) => photo.media_kind === 'video').length;
  const totalBytes = photos.reduce((sum, photo) => sum + Number(photo.file_size || 0), 0);
  const visiblePhotos = photos.filter((photo) => {
    if (mediaFilter === 'image') return photo.media_kind === 'image';
    if (mediaFilter === 'video') return photo.media_kind === 'video';
    return true;
  });

  el.innerHTML = '';

  if (summaryEl) {
    summaryEl.textContent =
      `Media: ${photos.length} | obrázky: ${imageCount} | videa: ${videoCount} | velikost: ${formatMb(totalBytes)} | filtr: ${mediaFilter}`;
  }

  if (!visiblePhotos.length) {
    const label = mediaFilter === 'image' ? 'Žádné obrázky.' : mediaFilter === 'video' ? 'Žádná videa.' : 'Žádné fotky.';
    el.innerHTML = `<div class="muted">${label}</div>`;
    updateMediaFilterButtons();
    return;
  }

  visiblePhotos.forEach((photo) => {
    const url = fileUrl(photo.file_path);
    const isVideo = (photo.mime_type || '').startsWith('video/');
    const photoTitle = photo.title || photo.file_path.split('/').pop() || (isVideo ? 'Video' : 'Fotka');
    const createdAt = formatDateTime(photo.created_at || '-');
    const absolutePath = `/data/uploads${photo.file_path}`;
    const shouldOpenEditor = openMediaEditorId === photo.id;
    el.innerHTML += `
      <div class="card photo-item">
        ${isVideo
          ? `<video src="${url}" controls preload="metadata" style="max-width:100%;border-radius:10px;"></video>`
          : `<a href="#" onclick="openMediaViewer('${url}', '${esc(photo.mime_type || '')}');return false;"><img src="${url}" alt="Fotka"></a>`}
        <div><b>${esc(photoTitle)}</b></div>
        <div class="muted">${isVideo ? 'Video' : 'Fotka'} | ${esc(photo.mime_type || '-')}</div>
        <div class="muted">Velikost: ${formatMb(photo.file_size || 0)} | Vytvoreno: ${esc(createdAt)}</div>
        <div class="row-actions">
          <button class="ghost-btn" onclick="openMediaViewer('${url}', '${esc(photo.mime_type || '')}')">Otevrit</button>
          <button class="ghost-btn" onclick="toggleMediaEditor(${photo.id})">Upravit nazev</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(photoTitle)}, "Název zkopírován.")'>Kopírovat název</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(absolutePath)}, "Cesta zkopírována.")'>Kopírovat cestu</button>
          <button class="ghost-btn" onclick="deletePhoto(${photo.id})">Smazat</button>
        </div>
        <div style="display:${shouldOpenEditor ? 'block' : 'none'};margin-top:8px;">
          <input id="media-title-${photo.id}" value="${esc(photoTitle)}" placeholder="nazev media">
          <button class="ghost-btn" onclick="saveMediaTitle(${photo.id})">Ulozit nazev</button>
        </div>
      </div>
    `;
  });

  openMediaEditorId = null;
  updateMediaFilterButtons();
}

function toggleMediaEditor(id) {
  openMediaEditorId = openMediaEditorId === id ? null : id;
  loadPhotos();
}

async function saveMediaTitle(id) {
  const input = document.getElementById(`media-title-${id}`);
  if (!input) return;

  try {
    await apiPut(`/photos/${id}`, { title: input.value });
    openMediaEditorId = null;
    await loadPhotos();
    setPhotoStatus(`Nazev media #${id} ulozen.`, 'ok');
  } catch (e) {
    setPhotoStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function deletePhoto(id) {
  if (!confirm('Smazat fotku?')) return;

  await apiDelete(`/photos/${id}`);
  await loadPhotos();
  await loadWatchFolderMedia();
  await loadSelectedProductSummary();
  setPhotoStatus(`Media #${id} smazano.`, 'ok');
}

async function uploadPhoto(e) {
  e.preventDefault();

  if (!selectedProductId) return alert('Vyber stavebn? okruh');
  const file = document.getElementById('photoInput').files[0];
  if (!file) return alert('Vyber foto nebo video');

  const fd = new FormData();
  fd.append('product_id', selectedProductId);
  fd.append('photo', file);

  const response = await fetch(apiUrl('/photos/upload'), {
    method: 'POST',
    headers: authHeaders(),
    body: fd
  });

  if (!response.ok) {
    throw new Error(`POST /photos/upload HTTP ${response.status}`);
  }

  document.getElementById('photoInput').value = '';
  await loadPhotos();
  await loadWatchFolderMedia();
  await loadSelectedProductSummary();
  setPhotoStatus('Media nahrano.', 'ok');
}

async function loadWatchFolderMedia() {
  const listEl = document.getElementById('watchFolderMedia');
  const hintEl = document.getElementById('watchFolderHint');
  if (!listEl || !hintEl) return;

  const suffix = selectedProductId ? `?product_id=${selectedProductId}` : '';
  const data = await apiGet(`/watch-folder/media${suffix}`);

  const counts = data.counts || {};
  lastWatchFolderCounts = counts;
  hintEl.textContent =
    `Sleduji ${data.watch_dir}` +
    `${selectedProductId ? ` | produkt ${selectedProductName()}` : ''}` +
    ` | vše: ${counts.total || 0}, obrázky: ${counts.image || 0}, videa: ${counts.video || 0}`;
  listEl.innerHTML = '';

  if (!data.files.length) {
    listEl.innerHTML = '<div class="muted">Inbox je prazdny.</div>';
    return;
  }

  listEl.innerHTML = data.files.map((file) => `
    <div class="card">
      <b>${mediaBadge(file.media_kind, file.mime_type)} ${esc(file.filename)}</b>
      <div class="muted">${esc(file.mime_type)} | ${Math.round((file.size || 0) / 1024 / 1024)} MB | ${esc(formatDateTime(file.modified_at || '-'))}</div>
      <div class="row-actions">
        <button type="button" class="ghost-btn" onclick='importWatchFolderMedia(${JSON.stringify(file.filename)})'>Import do produktu</button>
        <button type="button" class="ghost-btn" onclick='deleteWatchFolderMedia(${JSON.stringify(file.filename)})'>Smazat z inboxu</button>
        <button type="button" class="ghost-btn" onclick='copyText(${JSON.stringify(file.filename)}, "Název zkopírován.")'>Kopírovat název</button>
      </div>
    </div>
  `).join('');
}

async function importWatchFolderMedia(filename) {
  if (!selectedProductId) {
    alert('Vyber produkt');
    return;
  }

  try {
    await apiPost('/watch-folder/media/import', {
      product_id: selectedProductId,
      filename
    });
    await loadWatchFolderMedia();
    await loadPhotos();
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
    setPhotoStatus(`Inbox import hotovy: ${filename}`, 'ok');
  } catch (e) {
    setPhotoStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function importAllWatchFolderMedia() {
  if (!selectedProductId) {
    alert('Vyber produkt');
    return;
  }

  try {
    const result = await apiPost('/watch-folder/media/import-all', {
      product_id: selectedProductId
    });
    await loadWatchFolderMedia();
    await loadPhotos();
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
    setPhotoStatus(`Inbox import hotovy: ${result.imported || 0} souboru.`, 'ok');
  } catch (e) {
    setPhotoStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function deleteWatchFolderMedia(filename) {
  try {
    await apiDelete(`/watch-folder/media?filename=${encodeURIComponent(filename)}`);
    await loadWatchFolderMedia();
    await loadWatcherMinimum();
    setPhotoStatus(`Inbox soubor smazan: ${filename}`, 'ok');
  } catch (e) {
    setPhotoStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function initDiaryFormDefaults() {
  const dateEl = document.getElementById('diaryDate');
  const personEl = document.getElementById('diaryInspectionPerson');
  if (dateEl && !dateEl.value) dateEl.value = todayIsoDate();
  if (dateEl?.value) setDiaryCalendarDate(dateEl.value, false);
  if (personEl && !personEl.value) personEl.value = 'Ing. Hana Konvalinková';
  toggleInspectionFields();
}

function toggleInspectionFields() {
  const checked = Boolean(document.getElementById('diaryInspectionPresent')?.checked);
  const fields = document.getElementById('diaryInspectionFields');
  if (fields) fields.hidden = !checked;
}

function diaryWeatherLabel(value) {
  return {
    slunecno: 'Slunečno',
    zatazeno: 'Zataženo',
    dest: 'Déšť',
    vetrno: 'Větrno'
  }[value] || '-';
}

function inspectionClass(status) {
  if (status === 'serious') return 'inspection-serious';
  if (status === 'remarks' || status === 'verify') return 'inspection-remarks';
  if (status === 'ok') return 'inspection-ok';
  return '';
}

function nl2br(value) {
  return esc(value).replace(/\n/g, '<br>');
}

async function prefillDiaryWeather() {
  const date = document.getElementById('diaryDate')?.value || todayIsoDate();
  const timeFrom = document.getElementById('diaryTimeFrom')?.value || '08:00';
  const timeTo = document.getElementById('diaryTimeTo')?.value || '18:00';

  try {
    setDiaryStatus('Doplňuji počasí...', '');
    const weather = await apiGet(`/diary/weather?date=${encodeURIComponent(date)}&time_from=${encodeURIComponent(timeFrom)}&time_to=${encodeURIComponent(timeTo)}`);
    const weatherEl = document.getElementById('diaryWeatherSummary');
    const tempEl = document.getElementById('diaryTemperatureAvg');
    if (weatherEl) weatherEl.value = weather.weather_summary || '';
    if (tempEl && weather.temperature_avg !== null && weather.temperature_avg !== undefined) tempEl.value = weather.temperature_avg;
    setDiaryStatus(`Počasí doplněno: ${diaryWeatherLabel(weather.weather_summary)}, ${weather.temperature_avg ?? '-'} °C`, 'ok');
  } catch (e) {
    setDiaryStatus(`MISS počasí: ${e.message}`, 'miss');
  }
}

function scheduleDiaryWeatherAutoFill() {
  clearTimeout(diaryWeatherTimer);
  diaryWeatherTimer = setTimeout(() => {
    prefillDiaryWeather();
  }, 450);
}

async function loadDiaryCalendar() {
  const el = document.getElementById('diaryCalendar');
  if (!el) return;
  const year = diaryCalendarYear;
  const month = diaryCalendarMonth;
  let days = [];
  try {
    days = await apiGet(`/diary/calendar?year=${year}`);
  } catch (e) {
    el.innerHTML = `<div class="muted status-miss">MISS kalendář: ${esc(e.message)}</div>`;
    return;
  }

  const dayMap = new Map(days.map((day) => [day.date, day]));
  const monthNames = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  const weekdayNames = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const holidaySet = new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-05-08`, `${year}-07-05`, `${year}-07-06`,
    `${year}-09-28`, `${year}-10-28`, `${year}-11-17`, `${year}-12-24`, `${year}-12-25`, `${year}-12-26`
  ]);

  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = Array.from({ length: firstWeekday }, () => '<span class="calendar-day calendar-blank"></span>').join('');
  const cells = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const isRed = weekday === 0 || weekday === 6 || holidaySet.has(date);
    const state = dayMap.get(date);
    return `
      <button type="button" class="calendar-day ${isRed ? 'calendar-red' : ''}" title="${date}" onclick="focusDiaryDate('${date}')">
        <span class="${state?.diary_count ? 'day-dot day-dot-left' : ''}"></span>
        <span class="calendar-day-number">${day}</span>
        <span class="${state?.inspection_count ? `day-dot day-dot-right ${inspectionClass(state.inspection_status)}` : ''}"></span>
      </button>
    `;
  }).join('');

  el.innerHTML = `
    <div class="month-card single-month-card">
      <div class="calendar-toolbar">
        <button type="button" class="ghost-btn" onclick="shiftDiaryCalendarMonth(-1)">Předchozí</button>
        <div class="calendar-selectors">
          <select id="diaryCalendarMonth" onchange="setDiaryCalendarMonthYear()" aria-label="Měsíc deníku">
            ${monthNames.map((name, index) => `<option value="${index}" ${index === month ? 'selected' : ''}>${esc(name)}</option>`).join('')}
          </select>
          <select id="diaryCalendarYear" onchange="setDiaryCalendarMonthYear()" aria-label="Rok deníku">
            ${[2026, 2027, 2028].map((item) => `<option value="${item}" ${item === year ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
        </div>
        <button type="button" class="ghost-btn" onclick="shiftDiaryCalendarMonth(1)">Další</button>
      </div>
      <div class="month-grid weekday-grid">
        ${weekdayNames.map((name) => `<span>${name}</span>`).join('')}
      </div>
      <div class="month-grid">${blanks}${cells}</div>
    </div>
  `;
}

function setDiaryCalendarDate(date, reload = true) {
  if (!date) return;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return;
  diaryCalendarYear = parsed.getFullYear();
  diaryCalendarMonth = parsed.getMonth();
  if (reload) loadDiaryCalendar();
}

function shiftDiaryCalendarMonth(delta) {
  const next = new Date(diaryCalendarYear, diaryCalendarMonth + delta, 1);
  if (next.getFullYear() < 2026 || next.getFullYear() > 2028) return;
  diaryCalendarYear = next.getFullYear();
  diaryCalendarMonth = next.getMonth();
  loadDiaryCalendar();
}

function focusDiaryDate(date) {
  const dateEl = document.getElementById('diaryDate');
  if (dateEl) dateEl.value = date;
  setDiaryCalendarDate(date, false);
  setDiaryFilter('all');
  scrollToSection('diarySection');
  scheduleDiaryWeatherAutoFill();
  const entryForDate = lastDiaryEntries.find((entry) => entry.entry_date === date);
  if (entryForDate) {
    showDiaryLinks(entryForDate.id);
  }
}

function setDiaryCalendarMonthYear() {
  const yearEl = document.getElementById('diaryCalendarYear');
  const monthEl = document.getElementById('diaryCalendarMonth');
  const year = Number(yearEl?.value);
  const month = Number(monthEl?.value);
  if (!Number.isInteger(year) || year < 2026 || year > 2028) return;
  if (!Number.isInteger(month) || month < 0 || month > 11) return;
  diaryCalendarYear = year;
  diaryCalendarMonth = month;
  loadDiaryCalendar();
}

async function loadDiarySelects() {
  const prodEl = document.getElementById('diaryProduct');
  const phaseEl = document.getElementById('diaryPhase');

  const products = await apiGet('/products');
  const phases = await apiGet('/phases');

  productsMap = {};
  phasesMap = {};

  prodEl.innerHTML = '<option value="">Produkt</option>';
  phaseEl.innerHTML = '<option value="">Faze</option>';

  products.forEach((product) => {
    productsMap[product.id] = product.name;
    prodEl.innerHTML += `<option value="${product.id}">${esc(product.name)}</option>`;
  });

  phases.forEach((phase) => {
    phasesMap[phase.id] = phase.name;
    phaseEl.innerHTML += `<option value="${phase.id}">${esc(phase.name)}</option>`;
  });

  syncDiaryProductToSelection();
  initDiaryFormDefaults();
}

function syncDiaryProductToSelection() {
  const prodEl = document.getElementById('diaryProduct');
  if (!prodEl) return;
  prodEl.value = selectedProductId ? String(selectedProductId) : '';
}

async function showDiaryLinks(id) {
  try {
    const entry = lastDiaryEntries.find((item) => Number(item.id) === Number(id));
    const detail = await apiGet(`/diary/${id}/links`);
    const receipts = detail.suggested?.receipts || [];
    const documents = detail.suggested?.documents || [];
    const photos = detail.suggested?.photos || [];
    const title = document.getElementById('diaryDetailTitle');
    const content = document.getElementById('diaryDetailContent');
    const panel = document.getElementById('diaryDetailPanel');
    if (title) title.textContent = entry ? `Záznam ${entry.entry_date}` : `Záznam #${id}`;
    const inspectionClassName = inspectionClass(entry?.inspection_status);
    const inspectionLabel = entry?.inspection_present
      ? (entry.inspection_summary || entry.inspection_status || 'kontrola evidována')
      : 'bez kontroly stavebního dozoru';
    if (content) {
      content.innerHTML = `
        <div class="diary-detail-meta">
          <span>Stavební dozor</span>
          <span class="inspection-state"><i class="inspection-dot ${inspectionClassName}"></i>${esc(inspectionLabel)}</span>
        </div>
        <div class="diary-detail-body">${entry ? nl2br(entry.content) : ''}</div>
        <div class="subsection">
          <h3>Vazby podle data</h3>
          <div class="link-list"><b>Faktury:</b> ${receipts.length ? receipts.map((item) => `<button type="button" class="ghost-btn" onclick="openMediaViewer('${fileUrl(item.file_path)}', '${esc(item.mime_type || '')}')">${esc(item.title || item.original_name || item.file_path)}</button>`).join('') : '<span class="muted">žádné</span>'}</div>
          <div class="link-list"><b>Dokumenty:</b> ${documents.length ? documents.map((item) => `<button type="button" class="ghost-btn" onclick="openMediaViewer('${fileUrl(item.file_path)}', '${esc(item.mime_type || '')}')">${esc(item.name || item.original_name || item.file_path)}</button>`).join('') : '<span class="muted">žádné</span>'}</div>
          <div class="link-list"><b>Fotky:</b> ${photos.length ? photos.map((item) => `<button type="button" class="ghost-btn" onclick="openMediaViewer('${fileUrl(item.file_path)}', '${esc(item.mime_type || '')}')">${esc(item.title || item.file_path)}</button>`).join('') : '<span class="muted">žádné</span>'}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="ghost-btn" onclick="editDiaryEntry(${id})">Upravit</button>
          <button type="button" class="ghost-btn" onclick="deleteDiaryEntry(${id})">Smazat záznam</button>
        </div>
      `;
    }
    if (panel) panel.hidden = false;
  } catch (e) {
    alert(`MISS: ${e.message}`);
  }
}

function editDiaryEntry(id) {
  const entry = lastDiaryEntries.find((item) => Number(item.id) === Number(id));
  if (!entry) return;
  const setters = {
    diaryDate: entry.entry_date || todayIsoDate(),
    diaryTimeFrom: entry.time_from || '08:00',
    diaryTimeTo: entry.time_to || '18:00',
    diaryWeatherSummary: entry.weather_summary || '',
    diaryTemperatureAvg: entry.temperature_avg ?? '',
    diaryProduct: entry.product_id || '',
    diaryPhase: entry.phase_id || '',
    diaryInspectionPerson: entry.inspection_person || 'Ing. Hana Konvalinková',
    diaryInspectionStatus: entry.inspection_status || 'ok',
    diaryInspectionNotes: entry.inspection_notes || '',
    diaryContent: entry.content || ''
  };
  Object.entries(setters).forEach(([idKey, value]) => {
    const el = document.getElementById(idKey);
    if (el) el.value = value;
  });
  const present = document.getElementById('diaryInspectionPresent');
  if (present) present.checked = Boolean(entry.inspection_present);
  editingDiaryId = Number(id);
  toggleInspectionFields();
  closeDiaryDetail();
  scrollToSection('diaryForm');
  const saveButton = document.getElementById('diarySaveButton');
  if (saveButton) saveButton.textContent = 'Uložit úpravy';
  setDiaryStatus(`Upravuješ záznam #${id}.`, 'ok');
}

function closeDiaryDetail() {
  const panel = document.getElementById('diaryDetailPanel');
  if (panel) panel.hidden = true;
}

async function deleteDiaryEntry(id) {
  if (!confirm('Opravdu smazat záznam stavebního deníku?')) return;
  try {
    await apiDelete(`/diary/${id}`);
    closeDiaryDetail();
    await loadDiary();
    await loadSelectedProductSummary();
    setDiaryStatus(`Záznam #${id} smazán.`, 'ok');
  } catch (e) {
    alert(`MISS: ${e.message}`);
  }
}

async function uploadDiaryPhotos(diaryId) {
  const input = document.getElementById('diaryPhotos');
  const files = Array.from(input?.files || []);
  const productId = document.getElementById('diaryProduct')?.value || selectedProductId;
  if (!files.length || !productId) return;

  for (const file of files) {
    const fd = new FormData();
    fd.append('product_id', productId);
    fd.append('photo', file);
    const response = await fetch(apiUrl('/photos/upload'), {
      method: 'POST',
      headers: authHeaders(),
      body: fd
    });
    const photo = await parseJsonResponse(response, 'POST /photos/upload');
    if (photo?.id) {
      await apiPost(`/diary/${diaryId}/links`, {
        entity_type: 'photo',
        entity_id: photo.id,
        link_reason: 'diary_upload'
      });
    }
  }

  if (input) input.value = '';
}

async function loadDiary() {
  const el = document.getElementById('diaryList');
  let data = [];

  try {
    data = await apiGet('/diary');
  } catch (e) {
    if (String(e.message || '').includes('HTTP 404') || String(e.message || '').includes('route_not_found')) {
      el.innerHTML = '<small>Deník zatím není aktivní.</small>';
      setDiaryStatus('Deník backend zatím není aktivní.', 'miss');
      return;
    }
    throw e;
  }

  el.innerHTML = '';
  lastDiaryEntries = data;
  const visibleData = data.filter((entry) => {
    if (diaryFilter !== 'product') return true;
    if (!selectedProductId) return false;
    return Number(entry.product_id) === Number(selectedProductId);
  });
  let lastDate = null;
  setDiaryStatus(`Záznamy: ${visibleData.length} / ${data.length} | filtr: ${diaryFilter}`, 'ok');

  if (!visibleData.length) {
    const label = diaryFilter === 'product' ? 'Zatím žádný záznam pro vybraný produkt.' : 'Zatím žádný záznam v deníku.';
    el.innerHTML = `<div class="card muted">${label}</div>`;
    updateDiaryFilterButtons();
    await loadDiaryCalendar();
    return;
  }

  visibleData.forEach((entry) => {
    if (entry.entry_date !== lastDate) {
      el.innerHTML += `<h3>${esc(entry.entry_date)}</h3>`;
      lastDate = entry.entry_date;
    }

    const timeRange = entry.time_from || entry.time_to ? `${entry.time_from || '?'}-${entry.time_to || '?'}` : '-';
    const weather = entry.weather_summary ? `${diaryWeatherLabel(entry.weather_summary)}${entry.temperature_avg !== null && entry.temperature_avg !== undefined ? `, ${entry.temperature_avg} °C` : ''}` : '-';
    const inspectionStatus = entry.inspection_present ? (entry.inspection_summary || entry.inspection_status || '-') : '-';

    el.innerHTML += `
      <div class="card diary-entry-card ${inspectionClass(entry.inspection_status)}" onclick="showDiaryLinks(${entry.id})">
        <div class="diary-entry-head">
          <div>
            <b>${esc(entry.entry_date)}</b>
            <small>${esc(timeRange)} | ${esc(weather)}</small>
          </div>
          <div class="icon-actions">
            <button type="button" class="icon-btn" title="Zobrazit záznam" onclick="event.stopPropagation(); showDiaryLinks(${entry.id})">◉</button>
            <button type="button" class="icon-btn" title="Upravit" onclick="event.stopPropagation(); editDiaryEntry(${entry.id})">✎</button>
          </div>
        </div>
        <div>${nl2br(entry.content)}</div>
        <small>Okruh: ${esc(productsMap[entry.product_id] || '-')} | Fáze: ${esc(phasesMap[entry.phase_id] || '-')} | Dozor: ${esc(inspectionStatus)}</small>
      </div>
    `;
  });

  updateDiaryFilterButtons();
  await loadDiaryCalendar();
}

async function addDiaryEntry() {
  const content = document.getElementById('diaryContent').value.trim();
  const inspectionPresent = Boolean(document.getElementById('diaryInspectionPresent')?.checked);
  if (!content && !inspectionPresent) return alert('Napiš text nebo vyplň kontrolu stavebního dozoru.');

  try {
    const payload = {
      content,
      entry_date: document.getElementById('diaryDate').value || todayIsoDate(),
      time_from: document.getElementById('diaryTimeFrom').value || null,
      time_to: document.getElementById('diaryTimeTo').value || null,
      weather_summary: document.getElementById('diaryWeatherSummary').value || null,
      temperature_avg: document.getElementById('diaryTemperatureAvg').value || null,
      weather_source: document.getElementById('diaryWeatherSummary').value ? 'manual_or_open_meteo' : null,
      product_id: document.getElementById('diaryProduct').value || null,
      phase_id: document.getElementById('diaryPhase').value || null,
      inspection_present: inspectionPresent,
      inspection_person: document.getElementById('diaryInspectionPerson').value || 'Ing. Hana Konvalinková',
      inspection_status: document.getElementById('diaryInspectionStatus').value || 'ok',
      inspection_notes: document.getElementById('diaryInspectionNotes').value || ''
    };
    const savedEntry = editingDiaryId
      ? await apiPut(`/diary/${editingDiaryId}`, payload)
      : await apiPost('/diary', payload);

    if (savedEntry?.id) await uploadDiaryPhotos(savedEntry.id);

    document.getElementById('diaryContent').value = '';
    document.getElementById('diaryInspectionNotes').value = '';
    document.getElementById('diaryInspectionPresent').checked = false;
    editingDiaryId = null;
    const saveButton = document.getElementById('diarySaveButton');
    if (saveButton) saveButton.textContent = 'Uložit záznam';
    toggleInspectionFields();
    await loadDiarySelects();
    await loadDiary();
    await loadWarrantyDashboard();
    await loadWarrantyAlerts();
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
    setDiaryStatus('Záznam uložen.', 'ok');
  } catch (e) {
    setDiaryStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function bootApplication() {
  if (appBootStarted) return;
  appBootStarted = true;
  initAppShell();
  restoreTriagePrefs();
  restoreDeferredDocumentIds();
  document.getElementById('productForm').addEventListener('submit', createProduct);
  document.getElementById('documentForm').addEventListener('submit', uploadDocument);
  document.getElementById('photoForm').addEventListener('submit', uploadPhoto);
  document.getElementById('receiptForm').addEventListener('submit', uploadReceipt);

  const documentSearchInput = document.getElementById('documentSearch');
  if (documentSearchInput) documentSearchInput.value = documentSearch;
  const documentSortSelect = document.getElementById('documentSort');
  if (documentSortSelect) documentSortSelect.value = documentSort;
  ['diaryDate', 'diaryTimeFrom', 'diaryTimeTo'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', scheduleDiaryWeatherAutoFill);
  });

  await runBootStep('API status', bootStatus);
  await runBootStep('produkty', loadProducts, (error) => {
    const el = document.getElementById('productsList');
    if (el) el.innerHTML = `<div class="muted status-miss">MISS: ${esc(error.message)}</div>`;
  });
  await runBootStep('dokumenty', loadDocuments, (error) => setDocumentStatus(`MISS: ${error.message}`, 'miss'));
  await runBootStep('media', loadPhotos, (error) => setPhotoStatus(`MISS: ${error.message}`, 'miss'));
  await runBootStep('receipts', loadReceipts, (error) => setReceiptStatus(`MISS: ${error.message}`, 'miss'));
  await runBootStep('rozpočet', loadBudget, (error) => {
    const el = document.getElementById('budgetStatus');
    if (el) el.textContent = `MISS: ${error.message}`;
  });
  await runBootStep('watch-folder', loadWatchFolderMedia, (error) => setPhotoStatus(`MISS watch-folder: ${error.message}`, 'miss'));
  await runBootStep('diary selects', loadDiarySelects, (error) => setDiaryStatus(`MISS selects: ${error.message}`, 'miss'));
  await runBootStep('diary', loadDiary, (error) => setDiaryStatus(`MISS: ${error.message}`, 'miss'));
  await runBootStep('záruky', loadWarrantyDashboard);
  await runBootStep('upozorneni', loadWarrantyAlerts);
  await runBootStep('watcher', loadWatcherMinimum, (error) => {
    const el = document.getElementById('watcherSummary');
    if (el) el.textContent = `MISS: ${error.message}`;
  });
  await runBootStep('vybraný produkt', loadSelectedProductSummary);
}

document.addEventListener('DOMContentLoaded', async () => {
  if (await initAuth()) {
    await bootApplication();
  }
});

function openLightbox(url) {
  openMediaViewer(url, 'image/*');
}

function closeMediaViewer() {
  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImg');
  const video = document.getElementById('lightboxVideo');
  if (img) img.src = '';
  if (video) {
    video.pause();
    video.src = '';
  }
  if (lb) lb.style.display = 'none';
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') {
    closeMediaViewer();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeMediaViewer();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('lightboxClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeMediaViewer);
  }
});
