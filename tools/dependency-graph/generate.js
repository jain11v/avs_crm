// Regenerates module-map.html from the current source tree — run this
// after any change to backend/src or frontend/src that adds/removes/moves
// require()/import statements, rather than re-deriving the graph by hand.
//
//   node tools/dependency-graph/generate.js
//
// Walks backend/src and frontend/src, extracts every LOCAL (relative)
// require()/import target, resolves it to a real file, and embeds the
// result into template.html (which has a __GRAPH_JSON__ placeholder) to
// produce module-map.html — a self-contained, no-build-step viewer you can
// open directly in a browser, no server or claude.ai needed.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = __dirname;

function walk(dir, exts, exclude) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (exclude.some((ex) => full.includes(ex))) continue;
    if (entry.isDirectory()) {
      results = results.concat(walk(full, exts, exclude));
    } else if (exts.includes(path.extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function extractImports(file) {
  const content = fs.readFileSync(file, 'utf8');
  const imports = [];
  const reqRe = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reqRe.exec(content))) imports.push(m[1]);
  const impRe = /import\s+(?:[^'"]*?from\s+)?['"](\.[^'"]+)['"]/g;
  while ((m = impRe.exec(content))) imports.push(m[1]);
  return imports;
}

function resolveTarget(fromFile, rel) {
  const target = path.resolve(path.dirname(fromFile), rel);
  const tryExts = ['', '.js', '.jsx', '/index.js', '/index.jsx'];
  for (const ext of tryExts) {
    if (fs.existsSync(target + ext) && fs.statSync(target + ext).isFile()) {
      return target + ext;
    }
  }
  return target;
}

function extractGraph(srcDir, exts) {
  const files = walk(srcDir, exts, ['node_modules', '__tests__']);
  const nodes = files.map((f) => toPosix(path.relative(ROOT, f)));
  const edges = [];
  for (const f of files) {
    for (const rel of extractImports(f)) {
      const resolved = resolveTarget(f, rel);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) continue;
      const toRel = toPosix(path.relative(ROOT, resolved));
      if (toRel.endsWith('.css')) continue;
      edges.push({ from: toPosix(path.relative(ROOT, f)), to: toRel });
    }
  }
  return { nodes, edges };
}

// Category = the top-level folder under src/ (controllers, routes, utils,
// pages, components, ...) — a file directly in src/ itself is 'root'.
function categorize(id) {
  const parts = id.split('/');
  const srcIdx = parts.indexOf('src');
  const rest = parts.slice(srcIdx + 1);
  return rest.length === 1 ? 'root' : rest[0];
}

function shape(sideData) {
  const nodes = sideData.nodes.map((id) => ({
    id,
    label: id.split('/').pop(),
    category: categorize(id),
  }));
  const edges = sideData.edges.map((e) => ({ source: e.from, target: e.to }));
  return { nodes, edges };
}

const graph = {
  backend: shape(extractGraph(path.join(ROOT, 'backend', 'src'), ['.js'])),
  frontend: shape(extractGraph(path.join(ROOT, 'frontend', 'src'), ['.js', '.jsx'])),
};

const template = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');
const output = template.replace('__GRAPH_JSON__', JSON.stringify(graph));
fs.writeFileSync(path.join(HERE, 'module-map.html'), output);

console.log(`backend:  ${graph.backend.nodes.length} files, ${graph.backend.edges.length} imports`);
console.log(`frontend: ${graph.frontend.nodes.length} files, ${graph.frontend.edges.length} imports`);
console.log(`written to ${path.join(HERE, 'module-map.html')}`);
