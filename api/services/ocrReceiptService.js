const { calcWarranty } = require('./warrantyService');

function parseDateCandidate(text) {
  if (!text) return null;

  const iso = text.match(/\b(20\d{2})[-_.](\d{2})[-_.](\d{2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const cz = text.match(/\b(\d{2})[._-](\d{2})[._-](20\d{2})\b/);
  if (cz) {
    return `${cz[3]}-${cz[2]}-${cz[1]}`;
  }

  return null;
}

function extractCandidates(receipt) {
  const sourceName = String(receipt.original_name || receipt.title || receipt.file_path || '');
  const baseName = sourceName.replace(/\.[^.]+$/, '');
  const docMatch = baseName.match(/\b\d{6,}\b/);
  const documentNumber = docMatch ? docMatch[0] : null;
  const purchaseDate = parseDateCandidate(baseName);
  const warrantyMonths = purchaseDate ? 24 : null;
  const warrantyUntil = calcWarranty(purchaseDate, warrantyMonths);

  return {
    mode: 'filename_heuristic',
    source_name: sourceName,
    title_candidate: baseName || null,
    document_number_candidate: documentNumber,
    purchase_date_candidate: purchaseDate,
    warranty_months_candidate: warrantyMonths,
    warranty_until_candidate: warrantyUntil,
    auto_fillable: {
      document_number: !receipt.document_number && !!documentNumber,
      purchase_date: !receipt.purchase_date && !receipt.date && !!purchaseDate
    }
  };
}

module.exports = {
  extractCandidates
};
