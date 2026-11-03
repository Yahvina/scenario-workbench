import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sample = process.argv.includes('--sample');
const htmlFile = path.join(root, sample ? 'design/neutral-workbench.html' : 'index.html');
const htmlDirectory = path.dirname(htmlFile);
let html = await readFile(htmlFile, 'utf8');
const entryTag = html.match(/<script type="module" src="([^"]+)"><\/script>/);
if (!entryTag || !entryTag[1].startsWith('.')) throw new Error('Expected relative ESM entry point');
const outputName = sample ? 'neutral-workbench.html' : 'scenario-workbench.html';
const modules = new Map();
async function collect(file) {
  const key = path.relative(root, file).replaceAll('\\', '/');
  if (modules.has(key)) return key;
  let source = await readFile(file, 'utf8');
  modules.set(key, '');
  const imports = [...source.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm)];
  for (const match of imports) {
    if (!match[2].startsWith('.')) throw new Error('External runtime dependency is not allowed: ' + match[2]);
    const target = path.resolve(path.dirname(file), match[2]);
    if (!target.startsWith(root)) throw new Error('Import escapes source root');
    const dependency = await collect(target);
    const names = match[1].split(',').map(value => value.trim().replace(/\s+as\s+/, ': ')).join(', ');
    source = source.replace(match[0], 'const { ' + names + ' } = __require(' + JSON.stringify(dependency) + ');');
  }
  const exports = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm)].map(match => match[1]);
  source = source.replace(/^export\s+/gm, '');
  if (/^import\s/m.test(source)) throw new Error('Unsupported import syntax in ' + key);
  modules.set(key, source + '\nObject.assign(__exports, { ' + exports.join(', ') + ' });');
  return key;
}
const entry = await collect(path.resolve(htmlDirectory, entryTag[1]));
const definitions = [...modules].map(([key, source]) => JSON.stringify(key) + ': (__require, __exports) => {\n' + source + '\n}').join(',\n');
const bundle = '(() => {\nconst __modules = {\n' + definitions + '\n};\nconst __cache = {};\nfunction __require(id) { if (__cache[id]) return __cache[id]; const value = {}; __cache[id] = value; __modules[id](__require, value); return value; }\n__require(' + JSON.stringify(entry) + ');\n})();';
new Script(bundle, { filename: 'offline-bundle.js' });
const sheets = [...html.matchAll(/\s*<link rel="stylesheet" href="([^"\n]+\.css)">/g)];
const styles = [];
for (const sheet of sheets) {
  if (!sheet[1].startsWith('.')) throw new Error('External stylesheet not allowed');
  const target = path.resolve(htmlDirectory, sheet[1]);
  if (!target.startsWith(root)) throw new Error('Stylesheet escapes root');
  styles.push(await readFile(target, 'utf8'));
  html = html.replace(sheet[0], '');
}
html = html.replace('</head>', () => '<style>\n' + styles.join('\n') + '\n</style>\n</head>');
html = html.replace(entryTag[0], () => '<script>\n' + bundle.replace(/<\/script/gi, '<\\/script') + '\n</script>');
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', outputName), html);
console.log('Built dist/' + outputName + ' (' + Buffer.byteLength(html) + ' bytes; ' + modules.size + ' modules; no external runtime dependencies)');
