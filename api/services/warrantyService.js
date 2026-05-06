function calcWarranty(purchase_date, months) {
  if (!purchase_date || !months) return null;

  const d = new Date(purchase_date);
  d.setMonth(d.getMonth() + parseInt(months));

  return d.toISOString().split('T')[0];
}

module.exports = {
  calcWarranty
};
