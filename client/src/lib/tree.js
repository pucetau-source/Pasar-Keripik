// Category tree helpers. Nodes: {id, name, parent_id, position, children: []}
export function flatten(tree, depth = 0, path = [], out = []) {
  for (const n of tree || []) {
    const p = [...path, n.name];
    out.push({ ...n, depth, path: p, pathLabel: p.join(' / ') });
    if (n.children?.length) flatten(n.children, depth + 1, p, out);
  }
  return out;
}

export function descendantIds(node, out = new Set()) {
  out.add(node.id);
  (node.children || []).forEach((c) => descendantIds(c, out));
  return out;
}

export function findNode(tree, id) {
  for (const n of tree || []) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}

// Build a tree from a flat list if the server returns one
export function ensureTree(list) {
  if (!Array.isArray(list)) return [];
  if (list.some((n) => Array.isArray(n.children))) return list;
  const by = new Map(list.map((n) => [n.id, { ...n, children: [] }]));
  const roots = [];
  for (const n of by.values()) {
    const p = n.parent_id != null && by.get(n.parent_id);
    (p ? p.children : roots).push(n);
  }
  const sort = (a) => { a.sort((x, y) => (x.position ?? 0) - (y.position ?? 0) || x.name.localeCompare(y.name)); a.forEach((n) => sort(n.children)); };
  sort(roots);
  return roots;
}
