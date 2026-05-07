const API_BASE = window.APP_CONFIG.API_BASE;

let productsMap = {};
let phasesMap = {};
let selectedProductId = null;
let receiptFilter = 'all';
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
let deferredDocumentIds = [];

const STARTER_PRODUCTS_TOP8 = [
  { name: 'Zakladova deska', description: 'Konstrukcni celek: skladba, vykresy, kalkulace, fotky armovani a betonaze.' },
  { name: 'Zdivo', description: 'Nosny a vyplnovy system: cihly, preklady, technicke listy, fotky zdeni.' },
  { name: 'Stropy', description: 'Varianty a realizace stropu: MIAKO / SPIROLL / PREFA, statika, montaz.' },
  { name: 'Stresni plast', description: 'Krytina, folie, late, detaily, fotky realizace strechy.' },
  { name: 'Svisla okna a dvere', description: 'Fasadni okna, vstupni dvere, specifikace, doklady, zaruky.' },
  { name: 'Tepelne cerpadlo', description: 'Vybrany system vytapeni: nabidky, technicke listy, zaruka, servis.' },
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
    setPhotoStatus('MISS: kopirovani selhalo', 'miss');
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

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  return parseJsonResponse(response, `GET ${path}`);
}

async function apiPost(path, data) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return parseJsonResponse(response, `POST ${path}`);
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
    el.textContent = 'Vyber produkt.';
    if (guideEl) guideEl.textContent = 'Zarazeni: -';
    if (healthEl) healthEl.textContent = 'Stav produktu: -';
    if (issuesEl) issuesEl.textContent = 'K reseni: -';
    if (nextEl) nextEl.textContent = 'Dalsi krok: -';
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
    if (isWorkbench) nextStep = 'Tridit dokumentaci do cilovych produktu.';
    else if (inboxCount > 0) nextStep = `Zpracuj inbox media (${inboxCount}).`;
    else if (reviewNeeded > 0) nextStep = `Zkontroluj OCR receipts (${reviewNeeded}).`;
    else if (missingDocumentNumber > 0) nextStep = `Dopln cislo dokladu u receipts (${missingDocumentNumber}).`;
    else if (missingSupplier > 0) nextStep = `Dopln dodavatele u receipts (${missingSupplier}).`;
    else if (missingPurchaseDate > 0) nextStep = `Dopln datum nakupu u receipts (${missingPurchaseDate}).`;
    else if (pendingReceipts > 0) nextStep = `Dokoncit pending receipts (${pendingReceipts}).`;
    else if (expiringSoon > 0) nextStep = `Zkontroluj zaruky koncici do 30 dni (${expiringSoon}).`;
    else if (!documentList.length) nextStep = 'Pridat prvni dokument k produktu.';
    else if (!photoList.length) nextStep = 'Pridat prvni foto nebo video.';
    else if (!diaryForProduct.length) nextStep = 'Pridat prvni zapis do deniku.';

    el.textContent =
      `Produkt: ${currentProductName}${isWorkbench ? ' | staging/workbench' : ''} | dokumenty: ${documentList.length} (pdf ${pdfDocuments}, obrazky ${imageDocuments}, ostatni ${otherDocuments}) | receipts: ${receiptList.length} (ready ${readyReceipts}, pending ${pendingReceipts}) | media: ${photoList.length} (obrazky ${imageCount}, videa ${videoCount}) | diary: ${diaryForProduct.length} | diary filtr: ${diaryFilter}`;

    if (guideEl) {
      guideEl.textContent = isWorkbench
        ? 'Zarazeni: staging/workbench | nahrat: projektova dokumentace, rozpocty, vykresy, technicke podklady'
        : guide
        ? `Zarazeni: #${guide.order} | skupina: ${guide.group} | nahrat: ${guide.uploads}`
        : 'Zarazeni: vlastni produkt bez sablony';
    }

    if (healthEl) {
      healthEl.textContent = isWorkbench
        ? `Stav produktu: staging | problemu: ${criticalIssues}`
        : `Stav produktu: ${productHealth} | problemu: ${criticalIssues}`;
    }

    if (issuesEl) {
      const parts = [
        `pending ${pendingReceipts}`,
        `review ${reviewNeeded}`,
        `chybi doklad ${missingDocumentNumber}`,
        `chybi dodavatel ${missingSupplier}`,
        `chybi datum ${missingPurchaseDate}`,
        `zaruka do 30 dni ${expiringSoon}`,
        `inbox ${inboxCount}`
      ];
      const suggestedDocumentCount = documentList.filter((item) => {
        const suggestion = suggestDocumentTarget(item);
        return suggestion && Number(suggestion.productId) !== Number(item.product_id);
      }).length;
      const unsortedDocumentCount = documentList.filter((item) => !suggestDocumentTarget(item)).length;
      issuesEl.textContent = isWorkbench
        ? `K reseni: trideni dokumentace | doporucene ${suggestedDocumentCount} | bez navrhu ${unsortedDocumentCount} | inbox ${inboxCount}`
        : `K reseni: ${parts.join(' | ')}`;
    }

    if (nextEl) {
      nextEl.textContent = `Dalsi krok: ${nextStep}`;
    }
    if (completionEl) {
      completionEl.textContent = isWorkbench
        ? `Hotovost: staging | dokumenty ${documentList.length} | doporucene ${documentList.filter((item) => {
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
    selectedEl.textContent = `Produkt: ${selectedProductName()}`;
  }

  if (summaryEl) {
    const readyCount = receipts.filter((item) => item.status === 'ready').length;
    const pendingCount = receipts.filter((item) => item.status !== 'ready').length;
    const reviewNeededCount = receipts.filter((item) => item.ocr_status === 'review_needed').length;
    summaryEl.textContent =
      `Receipts: ${receipts.length} | ready: ${readyCount} | pending: ${pendingCount} | review: ${reviewNeededCount} | filtr: ${receiptFilter}`;
  }
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
      `Faze: ${status.counts?.phases ?? '-'}\n` +
      `Mistnosti: ${status.counts?.rooms ?? '-'}\n` +
      `Produkty: ${status.counts?.products ?? '-'}`;
  } catch (e) {
    el.textContent = `MISS: ${e.message}`;
  }
}

async function loadProducts() {
  const el = document.getElementById('productsList');
  const products = sortProductsByGuide(await apiGet('/products'));

  productsMap = {};
  el.innerHTML = '';

  if (!products.length) {
    selectedProductId = null;
    el.innerHTML = '<div class="muted">Zatim zadne produkty.</div>';
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

    el.innerHTML += `
      <div class="card">
        <img src="${qrUrl(product.id)}" style="float:right;width:40px;height:40px;">
        <b>${esc(product.name)}</b> (${product.id})${guide ? ` <span class="muted">#${guide.order} | ${esc(guide.group)}</span>` : ''}${isWorkbench ? ` <span class="muted" style="color:#0f766e;">staging/workbench</span>` : ''}<br>
        ${esc(product.description || '')}<br>
        ${isWorkbench ? `<div class="muted">Workbench: sem nahraj projektovou dokumentaci a odtud ji trid.</div>` : ''}
        ${guide ? `<div class="muted">Nahrat: ${esc(guide.uploads)}</div>` : ''}
        <div class="row-actions">
          <button onclick="selectProduct(${product.id})">Vybrat</button>
          <button class="ghost-btn" onclick="deleteProduct(${product.id})">Smazat</button>
        </div>
      </div>
    `;
  });

  updateReceiptToolbar([]);
  saveTriagePrefs();
  loadSelectedProductSummary();
}

async function deleteProduct(id) {
  await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
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
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const visibleDeferredDocs = getVisibleDocumentsForCurrentView(docs)
    .filter((doc) => isDeferredDocument(doc.id));

  if (!visibleDeferredDocs.length) {
    setDocumentStatus('Zadne viditelne odlozene dokumenty k vraceni.', 'ok');
    return;
  }

  visibleDeferredDocs.forEach((doc) => undeferDocumentId(doc.id));
  await loadDocuments();
  setDocumentStatus(`Vraceno do fronty: ${visibleDeferredDocs.length}.`, 'ok');
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
    { keywords: ['okna', 'okno', 'dvere', 'sokol okna'], target: 'Svisla okna a dvere' },
    { keywords: ['stresni okna', 'stresni'], target: 'Stresni okna' },
    { keywords: ['zaluzie', 'rolety', 'stineni'], target: 'Stineni' },
    { keywords: ['podlahove topeni', 'podlahovka', 'rozdělovac', 'rozdelo', 'okruhy'], target: 'Podlahove topeni' },
    { keywords: ['anhydrit', 'zalivka', 'beton podlah', 'lite podlahy'], target: 'Podlahove souvrstvi' },
    { keywords: ['tepelne cerpadlo', 'tč', 'tc ', 'acond', 'ivt', 'stiebel', 'ctc', 'klimotop', 'pzp', 'reo heating', 'ac heating'], target: 'Tepelne cerpadlo' },
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

  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
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
  const inWorkbench = scopedToSelected && isProjectDocsWorkbench(selectedProductName());
  const visibleDocs = getVisibleDocumentsForCurrentView(docs);

  el.innerHTML = '';

  if (summaryEl) {
    summaryEl.textContent =
      `Documents: ${docs.length} | viditelne: ${visibleDocs.length} | pdf: ${pdfCount} | obrazky: ${imageCount} | ostatni: ${otherCount} | duplicity: ${duplicateCount} | doporucene: ${suggestedCount} | bez navrhu: ${unsortedCount} | odlozene: ${deferredCount} | scope: ${documentScope} | filtr: ${documentFilter} | hledani: ${documentSearch || '-'} | razeni: ${documentSort}`;
  }

  if (suggestionsEl) {
    if (!suggestionBuckets.length) {
      suggestionsEl.textContent = unsortedCount ? `Navrhy trideni: zadne. Bez navrhu: ${unsortedCount}.` : 'Navrhy trideni: zadne.';
    } else {
      suggestionsEl.innerHTML = `
        <div class="card">
          <b>Navrhy trideni</b>
          <div class="muted" style="margin-top:6px;">Bez navrhu: ${unsortedCount}</div>
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
      `Rozlozeni: ${currentTop || '-'} | cilove presuny: ${targetTop || '-'} | bez navrhu: ${unsortedCount} | odlozene: ${deferredCount}`;
  }

  if (workbenchEl) {
    if (!inWorkbench) {
      workbenchEl.textContent = 'Workbench: vyber staging produkt pro trideni projektove dokumentace.';
    } else {
      const triageDone = docs.length - actionableSuggested.length - actionableUnsorted.length;
      const triagePct = docs.length ? Math.round((triageDone / docs.length) * 100) : 100;
      const workbenchDone = actionableSuggested.length === 0 && actionableUnsorted.length === 0;
      workbenchEl.innerHTML = `
        <div class="card">
          <b>Workbench trideni</b>
          ${workbenchDone ? `<div class="muted" style="margin-top:6px;color:#0f766e;"><b>DONE: staging je dotrideny</b></div>` : ''}
          <div class="muted" style="margin-top:6px;">Ve stagingu: ${docs.length} | doporucene: ${actionableSuggested.length} | bez navrhu: ${actionableUnsorted.length} | odlozene: ${deferredCount} | hotovo: ${triageDone}/${docs.length} (${triagePct}%)</div>
          <div class="muted" style="margin-top:6px;">Posledni rucni cil: ${lastManualDocumentProductId ? esc(productsMap[lastManualDocumentProductId] || `produkt #${lastManualDocumentProductId}`) : 'zadny'}</div>
          <div class="row-actions" style="margin-top:8px;">
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('all')">Vse ve stagingu</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('todo')">Jen k reseni</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('suggested')">Jen doporucene</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('unsorted')">Jen bez navrhu</button>
            <button type="button" class="ghost-btn" onclick="setDocumentFilter('deferred')">Jen odlozene</button>
          </div>
          <div class="row-actions" style="margin-top:8px;">
            <button type="button" class="ghost-btn" onclick="openNextSuggestedDocument()">Otevrit dalsi doporuceny</button>
            <button type="button" class="ghost-btn" onclick="openNextUnsortedDocument()">Otevrit dalsi bez navrhu</button>
          </div>
          <div class="row-actions" style="margin-top:8px;">
            <button type="button" class="ghost-btn" onclick="moveNextSuggestedDocument()">Presunout dalsi doporuceny</button>
            <button type="button" class="ghost-btn" onclick="moveNextUnsortedDocumentToLastTarget()">Zaradit dalsi bez navrhu do posledniho cile</button>
            <button type="button" class="ghost-btn" onclick="deferNextActionableDocument()">Odlozit dalsi k reseni</button>
            <button type="button" class="ghost-btn" onclick="undeferAllVisibleDocuments()">Vratit viditelne odlozene</button>
          </div>
        </div>
      `;
    }
  }

  if (!visibleDocs.length) {
    const label =
      documentFilter === 'pdf' ? 'Zadne PDF dokumenty.' :
      documentFilter === 'image' ? 'Zadne obrazkove dokumenty.' :
      documentFilter === 'other' ? 'Zadne ostatni dokumenty.' :
      documentFilter === 'todo' ? 'Zadne dokumenty k reseni.' :
      documentFilter === 'suggested' ? 'Zadne doporucene presuny.' :
      documentFilter === 'unsorted' ? 'Zadne dokumenty bez navrhu.' :
      documentFilter === 'deferred' ? 'Zadne odlozene dokumenty.' :
      documentSearch ? 'Hledani nic nenaslo.' :
      'Zadne dokumenty.';
    el.innerHTML = `<div class="muted">${label}</div>`;
    updateDocumentFilterButtons();
    updateDocumentScopeButtons();
    return;
  }

  visibleDocs.forEach((doc) => {
    const url = `${API_BASE.replace('/api', '')}/files${doc.file_path}`;
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

    el.innerHTML += `
      <div class="card">
        <img src="${qrUrl(doc.id)}" style="float:right;width:40px;height:40px;">
        <a href="#" onclick="openMediaViewer('${url}', '${esc(doc.mime_type || '')}');return false;"><b>${docIcon(doc)} ${esc(docName)}</b></a>
        ${isDeferred ? `<div class="muted" style="color:#7c3aed;"><b>ODLOZENO</b></div>` : ''}
        ${inWorkbench && suggestion && Number(suggestion.productId) !== Number(doc.product_id) ? `<div class="muted" style="color:#0f766e;"><b>TRIAGE: doporuceny presun</b></div>` : ''}
        ${inWorkbench && !suggestion ? `<div class="muted" style="color:#b45309;"><b>TRIAGE: rucni zarazeni</b></div>` : ''}
        ${isDuplicate ? `<div class="muted" style="color:#b45309;">Mozna duplicita</div>` : ''}
        <div class="muted">Aktualne: ${esc(currentProductName)}</div>
        ${suggestion && Number(suggestion.productId) !== Number(doc.product_id) ? `<div class="muted" style="color:#0f766e;">Doporuceno presunout do: ${esc(suggestion.productName)}</div>` : ''}
        ${!suggestion ? `<div class="muted" style="color:#b45309;">Doporuceni: zadne</div>` : ''}
        <div class="muted">${esc(doc.mime_type || '-')} | Vytvoreno: ${esc(createdAt)}</div>
        <div class="muted">Cesta: ${esc(absolutePath)}</div>
        ${!suggestion ? `
        <div class="row-actions" style="margin-top:8px;">
          <select id="document-quick-product-${doc.id}">
            ${buildProductOptions(lastManualDocumentProductId || doc.product_id)}
          </select>
          <button class="ghost-btn" onclick="moveDocumentToQuickProduct(${doc.id})">Rychle zaradit</button>
        </div>
        ` : ''}
        <div class="row-actions">
          ${isPdf ? `<button class="ghost-btn" onclick="togglePreview(${doc.id})">Nahled</button>` : ''}
          <button class="ghost-btn" onclick="toggleDocumentEditor(${doc.id})">Upravit nazev</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(docName)}, "Nazev zkopirovan.")'>Kopirovat nazev</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(absolutePath)}, "Cesta zkopirovana.")'>Kopirovat cestu</button>
          ${suggestion && Number(suggestion.productId) !== Number(doc.product_id) ? `<button class="ghost-btn" onclick="openSuggestedProduct(${suggestion.productId}, ${JSON.stringify(suggestion.productName)})">Otevrit doporuceny produkt</button>` : ''}
          ${isDeferred ? `<button class="ghost-btn" onclick="undeferDocument(${doc.id})">Vratit do fronty</button>` : `<button class="ghost-btn" onclick="deferDocument(${doc.id})">Odlozit</button>`}
          <button class="ghost-btn" onclick="deleteDocument(${doc.id})">Smazat</button>
        </div>
        <div style="display:${shouldOpenEditor ? 'block' : 'none'};margin-bottom:8px;">
          <input id="document-name-${doc.id}" value="${esc(docName)}" placeholder="nazev dokumentu">
          <select id="document-product-${doc.id}">
            ${buildProductOptions(doc.product_id)}
          </select>
          <button class="ghost-btn" onclick="saveDocumentName(${doc.id})">Ulozit nazev</button>
          <button class="ghost-btn" onclick="moveDocumentToSelectedProduct(${doc.id})">Presunout na vybrany produkt</button>
          ${suggestion && Number(suggestion.productId) !== Number(doc.product_id) ? `<button class="ghost-btn" onclick="moveDocumentToSuggestedProduct(${doc.id}, ${suggestion.productId}, ${JSON.stringify(suggestion.productName)})">Presunout na doporuceny</button>` : ''}
        </div>
        <div id="preview-${doc.id}" style="display:none;">
          ${isPdf ? `<iframe src="${url}" style="width:100%;height:400px;"></iframe>` : ''}
          ${isImg ? `<img src="${url}" style="max-width:100%;">` : ''}
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
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidates = docs
    .map((doc) => ({ doc, suggestion: suggestDocumentTarget(doc) }))
    .filter((item) => !isDeferredDocument(item.doc.id) && item.suggestion && Number(item.suggestion.productId) !== Number(item.doc.product_id));

  if (!candidates.length) {
    setDocumentStatus('Zadne doporucene presuny.', 'ok');
    return;
  }

  let moved = 0;

  for (const item of candidates) {
    const response = await fetch(`${API_BASE}/documents/${item.doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.doc.name,
        product_id: item.suggestion.productId
      })
    });
    await parseJsonResponse(response, `PUT /documents/${item.doc.id}`);
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  setDocumentStatus(`Presunuto doporucene: ${moved}.`, 'ok');
}

async function moveVisibleSuggestedDocuments() {
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const visibleDocs = getVisibleDocumentsForCurrentView(docs)
    .filter((doc) => isActionableSuggestedDocument(doc));

  if (!visibleDocs.length) {
    setDocumentStatus('Zadne viditelne doporucene dokumenty k presunu.', 'ok');
    return;
  }

  let moved = 0;

  for (const doc of visibleDocs) {
    const response = await fetch(`${API_BASE}/documents/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: doc.name,
        product_id: doc._suggestion.productId
      })
    });
    await parseJsonResponse(response, `PUT /documents/${doc.id}`);
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  setDocumentStatus(`Presunuto viditelne doporucene: ${moved}.`, 'ok');
}

async function copyVisibleDocumentsList() {
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const visibleDocs = getVisibleDocumentsForCurrentView(docs);

  if (!visibleDocs.length) {
    setDocumentStatus('Zadne viditelne dokumenty ke kopirovani.', 'ok');
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
    setDocumentStatus('MISS: vyber cilovy produkt pro bez navrhu', 'miss');
    return;
  }

  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidates = docs
    .map((doc) => ({ doc, suggestion: suggestDocumentTarget(doc) }))
    .filter((item) => !item.suggestion && Number(item.doc.product_id) !== Number(targetProductId));

  if (!candidates.length) {
    setDocumentStatus('Zadne dokumenty bez navrhu k zarazeni.', 'ok');
    return;
  }

  lastManualDocumentProductId = Number(targetProductId);
  saveTriagePrefs();
  let moved = 0;

  for (const item of candidates) {
    const response = await fetch(`${API_BASE}/documents/${item.doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.doc.name,
        product_id: targetProductId
      })
    });
    await parseJsonResponse(response, `PUT /documents/${item.doc.id}`);
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  const targetName = productsMap[targetProductId] || 'vybraneho produktu';
  setDocumentStatus(`Zarazeno bez navrhu do ${targetName}: ${moved}.`, 'ok');
}

async function moveVisibleDocumentsToTarget() {
  const select = document.getElementById('document-visible-target');
  const targetProductId = select?.value;

  if (!targetProductId) {
    setDocumentStatus('MISS: vyber cilovy produkt pro viditelne dokumenty', 'miss');
    return;
  }

  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const visibleDocs = getVisibleDocumentsForCurrentView(docs)
    .filter((doc) => Number(doc.product_id) !== Number(targetProductId));

  if (!visibleDocs.length) {
    setDocumentStatus('Zadne viditelne dokumenty k zarazeni.', 'ok');
    return;
  }

  lastManualDocumentProductId = Number(targetProductId);
  let moved = 0;

  for (const doc of visibleDocs) {
    const response = await fetch(`${API_BASE}/documents/${doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: doc.name,
        product_id: targetProductId
      })
    });
    await parseJsonResponse(response, `PUT /documents/${doc.id}`);
    moved += 1;
  }

  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  const targetName = productsMap[targetProductId] || 'vybraneho produktu';
  setDocumentStatus(`Zarazeno viditelne do ${targetName}: ${moved}.`, 'ok');
}

async function moveSuggestedDocumentsToProduct(productId, productName) {
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidates = docs
    .map((doc) => ({ doc, suggestion: suggestDocumentTarget(doc) }))
    .filter((item) => item.suggestion && Number(item.suggestion.productId) === Number(productId) && Number(item.doc.product_id) !== Number(productId));

  if (!candidates.length) {
    setDocumentStatus(`Zadne dokumenty k presunu do ${productName}.`, 'ok');
    return;
  }

  let moved = 0;

  for (const item of candidates) {
    const response = await fetch(`${API_BASE}/documents/${item.doc.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.doc.name,
        product_id: item.suggestion.productId
      })
    });
    await parseJsonResponse(response, `PUT /documents/${item.doc.id}`);
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
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableSuggestedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Zadny dalsi doporuceny dokument.', 'ok');
    return;
  }

  documentFilter = 'suggested';
  openDocumentEditorId = candidate.id;
  await loadDocuments();
  scrollToSection('documentsList');
  setDocumentStatus(`Otevren doporuceny dokument #${candidate.id}.`, 'ok');
}

async function openNextUnsortedDocument() {
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableUnsortedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Zadny dalsi dokument bez navrhu.', 'ok');
    return;
  }

  documentFilter = 'unsorted';
  openDocumentEditorId = candidate.id;
  await loadDocuments();
  scrollToSection('documentsList');
  setDocumentStatus(`Otevren dokument bez navrhu #${candidate.id}.`, 'ok');
}

async function moveNextSuggestedDocument() {
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableSuggestedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Zadny dalsi doporuceny dokument k presunu.', 'ok');
    return;
  }

  await moveDocumentToSuggestedProduct(candidate.id, candidate._suggestion.productId, candidate._suggestion.productName);
}

async function moveNextUnsortedDocumentToLastTarget() {
  if (!lastManualDocumentProductId) {
    setDocumentStatus('MISS: zatim neni posledni rucni cil', 'miss');
    return;
  }

  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableUnsortedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Zadny dalsi dokument bez navrhu k zarazeni.', 'ok');
    return;
  }

  const response = await fetch(`${API_BASE}/documents/${candidate.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: candidate.name,
      product_id: lastManualDocumentProductId
    })
  });
  const result = await parseJsonResponse(response, `PUT /documents/${candidate.id}`);
  await loadDocuments();
  await loadProducts();
  await loadSelectedProductSummary();
  setDocumentStatus(`Dokument #${candidate.id} zarazen do ${(result?.document && productsMap[result.document.product_id]) || 'posledniho cile'}.`, 'ok');
  await continueWorkbenchQueue('unsorted');
}

async function deferNextActionableDocument() {
  const scopedToSelected = documentScope === 'selected' && selectedProductId;
  const path = scopedToSelected ? `/documents?product_id=${selectedProductId}` : '/documents';
  const docs = await apiGet(path);
  const candidate = docs
    .map((doc) => ({ ...doc, _suggestion: suggestDocumentTarget(doc) }))
    .find((doc) => isActionableSuggestedDocument(doc) || isActionableUnsortedDocument(doc));

  if (!candidate) {
    setDocumentStatus('Zadny dalsi dokument k odlozeni.', 'ok');
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
    setDocumentStatus(`Pokracuj: dokument bez navrhu #${nextUnsorted.id}.`, 'ok');
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
    const response = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.value,
        product_id: productInput ? productInput.value : undefined
      })
    });
    await parseJsonResponse(response, `PUT /documents/${id}`);
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
    setDocumentStatus('MISS: nejdriv vyber produkt', 'miss');
    return;
  }

  const nameInput = document.getElementById(`document-name-${id}`);

  try {
    const response = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput ? nameInput.value : undefined,
        product_id: selectedProductId
      })
    });
    await parseJsonResponse(response, `PUT /documents/${id}`);
    openDocumentEditorId = null;
    await loadDocuments();
    await loadProducts();
    await loadSelectedProductSummary();
    setDocumentStatus(`Dokument #${id} presunut na produkt ${selectedProductName()}.`, 'ok');
    await continueWorkbenchQueue();
  } catch (e) {
    setDocumentStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

async function moveDocumentToSuggestedProduct(id, productId, productName) {
  const nameInput = document.getElementById(`document-name-${id}`);

  try {
    const response = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput ? nameInput.value : undefined,
        product_id: productId
      })
    });
    await parseJsonResponse(response, `PUT /documents/${id}`);
    openDocumentEditorId = null;
    await loadDocuments();
    await loadProducts();
    await loadSelectedProductSummary();
    setDocumentStatus(`Dokument #${id} presunut do ${productName}.`, 'ok');
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
    const response = await fetch(`${API_BASE}/documents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput ? nameInput.value : undefined,
        product_id: productInput.value
      })
    });
    const result = await parseJsonResponse(response, `PUT /documents/${id}`);
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
  await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
  await loadDocuments();
  await loadSelectedProductSummary();
  setDocumentStatus(`Dokument #${id} smazan.`, 'ok');
}

async function uploadDocument(e) {
  e.preventDefault();

  if (!selectedProductId) return alert('Vyber produkt');
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

  const response = await fetch(`${API_BASE}/documents/upload`, {
    method: 'POST',
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
    el.innerHTML = '<div class="muted">Zadne zaruky ke sledovani.</div>';
    return;
  }

  el.innerHTML = items.map((receipt) => {
    const url = `${API_BASE.replace('/api', '')}/files${receipt.file_path}`;
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
    el.innerHTML = '<small>Zadne koncici zaruky</small>';
    return;
  }

  el.innerHTML = alerts.map((receipt) => {
    const url = `${API_BASE.replace('/api', '')}/files${receipt.file_path}`;
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
      label: 'Chybi dodavatel',
      items: watcher.groups?.missing_supplier || [],
      value: (r) => r.title || r.original_name || `receipt #${r.id}`
    },
    {
      label: 'Chybi cislo dokladu',
      items: watcher.groups?.missing_document_number || [],
      value: (r) => r.title || r.original_name || `receipt #${r.id}`
    },
    {
      label: 'Chybi datum nakupu',
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
        Watcher je cisty. Zadny problem k reseni.
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
    const response = await fetch(`${API_BASE}/receipts/ocr-approve-all-review-needed`, {
      method: 'POST'
    });
    const payload = await parseJsonResponse(response, 'POST /receipts/ocr-approve-all-review-needed');
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
    setReceiptStatus('MISS: nejdriv vyber produkt', 'miss');
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
    setReceiptStatus(`Nic k reseni pro filtr ${mode}.`, 'ok');
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
  return `${API_BASE}/qr?size=80&data=${data}`;
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

async function loadReceipts() {
  const el = document.getElementById('receiptsList');
  if (!el) return;

  const path = selectedProductId ? `/receipts?product_id=${selectedProductId}` : '/receipts';
  const receipts = await apiGet(path);
  const visibleReceipts = receipts.filter(filterWarranty);

  el.innerHTML = '';
  updateReceiptToolbar(visibleReceipts);
  setReceiptStatus('');

  if (!visibleReceipts.length) {
    el.innerHTML = '<div class="card muted">Zadne receipts pro aktualni filtr.</div>';
    return;
  }

  visibleReceipts.forEach((receipt) => {
    const url = `${API_BASE.replace('/api', '')}/files${receipt.file_path}`;
    const name = receipt.title || receipt.original_name || receipt.file_path;
    const warranty = getWarrantyStatus(receipt.warranty_until);
    const isPdf = (receipt.mime_type || '').includes('pdf') || name.toLowerCase().endsWith('.pdf');
    const isImg = (receipt.mime_type || '').includes('image');
    const shouldHighlight = focusedReceiptId === receipt.id;
    const shouldOpenEditor = openReceiptEditorId === receipt.id;
    const ocrSummary = formatOcrSummary(receipt);
    const absolutePath = `/data${receipt.file_path}`;
    const createdAt = formatDateTime(receipt.created_at || '-');

    el.innerHTML += `
      <div class="card" id="receipt-card-${receipt.id}" style="${shouldHighlight ? 'border:2px solid #0f766e;' : ''}">
        <img src="${qrUrl(receipt.id)}" style="float:right;width:40px;height:40px;">
        <a href="#" onclick="openMediaViewer('${url}', '${esc(receipt.mime_type || '')}');return false;"><b>${docIcon(receipt)} ${esc(name)}</b></a>
        ${receipt.warranty_until ? `<span style="margin-left:10px;padding:2px 6px;border-radius:6px;background:${warranty.color};color:white;font-size:12px;">${warranty.label}</span>` : ''}
        <div class="muted">Dodavatel: ${esc(receipt.supplier || '-')} | Doklad: ${esc(receipt.document_number || '-')}</div>
        <div class="muted">Datum: ${esc(receipt.purchase_date || '-')} | Castka: ${esc(receipt.total_amount || '-')}</div>
        <div class="muted">Status: ${esc(receipt.status || 'pending_review')} | OCR status: ${esc(receipt.ocr_status || 'not_processed')}</div>
        <div class="muted">Vytvoreno: ${esc(createdAt)} | Cesta: ${esc(absolutePath)}</div>
        <div class="muted">Automaticky: typ receipt, source manual, zaruka 24 mesicu kdyz je datum a nic chybi.</div>
        ${ocrSummary ? `<div class="muted">${esc(ocrSummary)}</div>` : ''}
        <div class="row-actions">
          ${isPdf ? `<button class="ghost-btn" onclick="togglePreview('receipt-${receipt.id}')">Nahled</button>` : ''}
          <button class="ghost-btn" onclick="runReceiptOcrMinimum(${receipt.id})">OCR minimum</button>
          <button class="ghost-btn" onclick="approveReceiptOcr(${receipt.id})">Schvalit OCR</button>
          <button onclick="togglePreview('receipt-edit-${receipt.id}')">Upravit</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(name)}, "Nazev zkopirovan.")'>Kopirovat nazev</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(receipt.document_number || '')}, "Cislo dokladu zkopirovano.")'>Kopirovat doklad</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(absolutePath)}, "Cesta zkopirovana.")'>Kopirovat cestu</button>
          <button class="ghost-btn" onclick="deleteReceipt(${receipt.id})">Smazat</button>
        </div>

        <div id="preview-receipt-edit-${receipt.id}" style="display:${shouldOpenEditor ? 'block' : 'none'};">
          <input id="receipt-title-${receipt.id}" value="${esc(receipt.title)}" placeholder="nazev"><br>
          <input id="receipt-supplier-${receipt.id}" value="${esc(receipt.supplier)}" placeholder="dodavatel"><br>
          <input id="receipt-number-${receipt.id}" value="${esc(receipt.document_number)}" placeholder="cislo dokladu"><br>
          <input id="receipt-date-${receipt.id}" value="${esc(receipt.purchase_date)}" type="date"><br>
          <input id="receipt-total-${receipt.id}" value="${esc(receipt.total_amount)}" type="number" step="0.01" placeholder="castka"><br>
          <input id="receipt-warranty-months-${receipt.id}" value="${esc(receipt.warranty_months)}" type="number" placeholder="zaruka mesicu"><br>
          <input id="receipt-warranty-until-${receipt.id}" value="${esc(receipt.warranty_until)}" type="date"><br>
          <input id="receipt-warranty-note-${receipt.id}" value="${esc(receipt.warranty_note)}" placeholder="poznamka k zaruce"><br>
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
    const response = await fetch(`${API_BASE}/receipts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: document.getElementById(`receipt-title-${id}`).value,
        supplier: document.getElementById(`receipt-supplier-${id}`).value,
        document_number: document.getElementById(`receipt-number-${id}`).value,
        purchase_date: document.getElementById(`receipt-date-${id}`).value,
        total_amount: document.getElementById(`receipt-total-${id}`).value,
        warranty_months: document.getElementById(`receipt-warranty-months-${id}`).value,
        warranty_until: document.getElementById(`receipt-warranty-until-${id}`).value,
        warranty_note: document.getElementById(`receipt-warranty-note-${id}`).value
      })
    });
    await parseJsonResponse(response, `PUT /receipts/${id}`);
    await loadReceipts();
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
    const response = await fetch(`${API_BASE}/receipts/${id}`, { method: 'DELETE' });
    await parseJsonResponse(response, `DELETE /receipts/${id}`);
    await loadReceipts();
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
    const response = await fetch(`${API_BASE}/receipts/upload`, {
      method: 'POST',
      body: fd
    });
    await parseJsonResponse(response, 'POST /receipts/upload');
    document.getElementById('receiptTitle').value = '';
    document.getElementById('receiptFile').value = '';
    await loadReceipts();
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
    const response = await fetch(`${API_BASE}/receipts/${id}/ocr-minimum`, {
      method: 'POST'
    });
    await parseJsonResponse(response, `POST /receipts/${id}/ocr-minimum`);
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
    const response = await fetch(`${API_BASE}/receipts/${id}/ocr-approve`, {
      method: 'POST'
    });
    await parseJsonResponse(response, `POST /receipts/${id}/ocr-approve`);
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
      `Media: ${photos.length} | obrazky: ${imageCount} | videa: ${videoCount} | velikost: ${formatMb(totalBytes)} | filtr: ${mediaFilter}`;
  }

  if (!visiblePhotos.length) {
    const label = mediaFilter === 'image' ? 'Zadne obrazky.' : mediaFilter === 'video' ? 'Zadna videa.' : 'Zadne fotky.';
    el.innerHTML = `<div class="muted">${label}</div>`;
    updateMediaFilterButtons();
    return;
  }

  visiblePhotos.forEach((photo) => {
    const url = `${API_BASE.replace('/api', '')}/files${photo.file_path}`;
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
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(photoTitle)}, "Nazev zkopirovan.")'>Kopirovat nazev</button>
          <button class="ghost-btn" onclick='copyText(${JSON.stringify(absolutePath)}, "Cesta zkopirovana.")'>Kopirovat cestu</button>
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
    const response = await fetch(`${API_BASE}/photos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: input.value })
    });
    await parseJsonResponse(response, `PUT /photos/${id}`);
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

  await fetch(`${API_BASE}/photos/${id}`, { method: 'DELETE' });
  await loadPhotos();
  await loadWatchFolderMedia();
  await loadSelectedProductSummary();
  setPhotoStatus(`Media #${id} smazano.`, 'ok');
}

async function uploadPhoto(e) {
  e.preventDefault();

  if (!selectedProductId) return alert('Vyber produkt');
  const file = document.getElementById('photoInput').files[0];
  if (!file) return alert('Vyber foto nebo video');

  const fd = new FormData();
  fd.append('product_id', selectedProductId);
  fd.append('photo', file);

  const response = await fetch(`${API_BASE}/photos/upload`, {
    method: 'POST',
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
    ` | vse: ${counts.total || 0}, obrazky: ${counts.image || 0}, videa: ${counts.video || 0}`;
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
        <button type="button" class="ghost-btn" onclick='copyText(${JSON.stringify(file.filename)}, "Nazev zkopirovan.")'>Kopirovat nazev</button>
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
    const response = await fetch(`${API_BASE}/watch-folder/media?filename=${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    await parseJsonResponse(response, 'DELETE /watch-folder/media');
    await loadWatchFolderMedia();
    await loadWatcherMinimum();
    setPhotoStatus(`Inbox soubor smazan: ${filename}`, 'ok');
  } catch (e) {
    setPhotoStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
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
}

function syncDiaryProductToSelection() {
  const prodEl = document.getElementById('diaryProduct');
  if (!prodEl) return;
  prodEl.value = selectedProductId ? String(selectedProductId) : '';
}

async function loadDiary() {
  const el = document.getElementById('diaryList');
  let data = [];

  try {
    data = await apiGet('/diary');
  } catch (e) {
    if (String(e.message || '').includes('HTTP 404') || String(e.message || '').includes('route_not_found')) {
      el.innerHTML = '<small>Denik zatim neni aktivni.</small>';
      setDiaryStatus('Diary backend zatim neni aktivni.', 'miss');
      return;
    }
    throw e;
  }

  el.innerHTML = '';
  const visibleData = data.filter((entry) => {
    if (diaryFilter !== 'product') return true;
    if (!selectedProductId) return false;
    return Number(entry.product_id) === Number(selectedProductId);
  });
  let lastDate = null;
  setDiaryStatus(`Zaznamy: ${visibleData.length} / ${data.length} | filtr: ${diaryFilter}`, 'ok');

  if (!visibleData.length) {
    const label = diaryFilter === 'product' ? 'Zatim zadny zaznam pro vybrany produkt.' : 'Zatim zadny zaznam v deniku.';
    el.innerHTML = `<div class="card muted">${label}</div>`;
    updateDiaryFilterButtons();
    return;
  }

  visibleData.forEach((entry) => {
    if (entry.entry_date !== lastDate) {
      el.innerHTML += `<h3>${esc(entry.entry_date)}</h3>`;
      lastDate = entry.entry_date;
    }

    el.innerHTML += `
      <div class="card">
        <div><b>${esc(entry.entry_date)}</b></div>
        ${esc(entry.content)}<br>
        <small>Produkt: ${esc(productsMap[entry.product_id] || '-')} | Faze: ${esc(phasesMap[entry.phase_id] || '-')}</small>
      </div>
    `;
  });

  updateDiaryFilterButtons();
}

async function addDiaryEntry() {
  const content = document.getElementById('diaryContent').value.trim();
  if (!content) return alert('Napis text');

  try {
    await apiPost('/diary', {
      content,
      product_id: document.getElementById('diaryProduct').value || null,
      phase_id: document.getElementById('diaryPhase').value || null
    });

    document.getElementById('diaryContent').value = '';
    await loadDiarySelects();
    await loadDiary();
    await loadWarrantyDashboard();
    await loadWarrantyAlerts();
    await loadWatcherMinimum();
    await loadSelectedProductSummary();
    setDiaryStatus('Zaznam ulozen.', 'ok');
  } catch (e) {
    setDiaryStatus(`MISS: ${e.message}`, 'miss');
    alert(`MISS: ${e.message}`);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
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

  await bootStatus();
  await loadProducts();
  await loadDocuments();
  await loadPhotos();
  await loadReceipts();
  await loadWatchFolderMedia();
  await loadDiarySelects();
  await loadDiary();
  await loadWarrantyDashboard();
  await loadWarrantyAlerts();
  await loadWatcherMinimum();
  await loadSelectedProductSummary();
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
