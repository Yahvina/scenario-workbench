export function variableColor(id) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return 'var(--chart-' + (hash % 4 + 1) + ')';
}
