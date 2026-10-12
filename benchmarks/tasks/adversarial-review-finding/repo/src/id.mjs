export function nextId(prefix, sequence) {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}
