export function items(records, options = {}) {
  return records.filter((record) => record.active);
}

export function count(records) {
  return items(records).length;
}
