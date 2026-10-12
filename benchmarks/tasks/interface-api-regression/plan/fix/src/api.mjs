export function items(records, options = {}) {
  const limit = Number.isSafeInteger(options.limit) && options.limit >= 0 ? options.limit : records.length;
  return records.filter((record) => record.active).slice(0, limit);
}

export function count(records) {
  return items(records).length;
}
