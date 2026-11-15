import { readFile, lstat, readdir, realpath } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const need = (value, message) => { if (!value) throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => need(object(value) && Object.keys(value).sort().join('|') === [...names].sort().join('|'), '清单字段不完整或含未知字段。');
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
function safePath(value) {
  need(typeof value === 'string' && value.length > 0 && value.length <= 600 && !isAbsolute(value) && !/[\\:\x00-\x1f]/.test(value), '清单路径无效。');
  need(value.split('/').every(part => part && !['.', '..'].includes(part) && !/[. ]$/.test(part)), '清单路径不能跳出交付目录。');
}
async function inventory(root, current = root) {
  const files = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const file = join(current, entry.name), stat = await lstat(file);
    need(!stat.isSymbolicLink(), '交付目录不接受符号链接。');
    if (stat.isDirectory()) files.push(...await inventory(root, file));
    else { need(stat.isFile(), '交付目录包含非普通文件。'); files.push(relative(root, file).split(sep).join('/')); }
    need(files.length <= 4096, '交付目录文件过多。');
  }
  return files;
}

export async function verifyDelivery(directory) {
  const root = await realpath(resolve(directory)), manifestPath = join(root, 'release-manifest.json');
  const manifestStat = await lstat(manifestPath);
  need(manifestStat.isFile() && !manifestStat.isSymbolicLink() && manifestStat.size <= 1024 * 1024, '清单缺失、不是普通文件或超过1 MiB。');
  const raw = await readFile(manifestPath); need(raw.length <= 1024 * 1024, '清单超过1 MiB。');
  const manifest = JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, ''));
  keys(manifest, ['format', 'version', 'candidateId', 'status', 'applicationVersion', 'applicationSourceCommit', 'applicationSha256', 'coreVersion', 'coreEntrySha256', 'realUserTrialCompleted', 'researchMappingApproved', 'files']);
  need(manifest.format === 'scenario-workbench.delivery-candidate' && manifest.version === 1 && manifest.status === 'technical-candidate', '不支持的交付候选清单。');
  for (const field of ['candidateId', 'applicationVersion', 'coreVersion']) need(typeof manifest[field] === 'string' && manifest[field].trim().length > 0 && manifest[field].length <= 120, '版本标识无效。');
  need(/^[0-9a-f]{40}$/.test(manifest.applicationSourceCommit) && sha(manifest.applicationSha256) && sha(manifest.coreEntrySha256), '缺少版本对应记录。');
  need(manifest.realUserTrialCompleted === false && manifest.researchMappingApproved === false, '本清单仅支持尚待真实试用与研究审定的技术候选。');
  need(Array.isArray(manifest.files) && manifest.files.length > 0 && manifest.files.length <= 4095, '清单文件数量无效。');
  const paths = new Set();
  for (const entry of manifest.files) {
    keys(entry, ['path', 'bytes', 'sha256']); safePath(entry.path);
    need(entry.path !== 'release-manifest.json' && !paths.has(entry.path) && sha(entry.sha256), '文件清单重复、自引用或哈希无效。'); paths.add(entry.path);
    need(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && entry.bytes <= 64 * 1024 * 1024, '文件大小无效或超过64 MiB。');
  }
  const actual = (await inventory(root)).filter(file => file !== 'release-manifest.json');
  need(actual.length === paths.size && actual.every(file => paths.has(file)), '交付目录有缺失文件或清单外文件。');
  for (const entry of manifest.files) {
    const file = join(root, ...entry.path.split('/')), stat = await lstat(file);
    need(stat.isFile() && !stat.isSymbolicLink() && stat.size === entry.bytes, '文件类型或大小不一致：' + entry.path);
    const data = await readFile(file);
    need(data.length === entry.bytes && createHash('sha256').update(data).digest('hex') === entry.sha256, '文件哈希不一致：' + entry.path);
  }
  need(manifest.files.find(file => file.path === '平台.html')?.sha256 === manifest.applicationSha256 && manifest.files.find(file => file.path === 'cib-core/index.mjs')?.sha256 === manifest.coreEntrySha256, '平台或算法包与版本标识不能对应。');
  return { valid: true, candidateId: manifest.candidateId, filesVerified: paths.size, applicationSourceCommit: manifest.applicationSourceCommit, applicationSha256: manifest.applicationSha256, realUserTrialCompleted: false, researchMappingApproved: false, signatureAuthenticated: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node check-delivery.mjs delivery-directory');
    process.stdout.write(JSON.stringify(await verifyDelivery(process.argv[2]), null, 2) + '\n');
  } catch (error) { process.stderr.write('交付核对未通过：' + error.message + '\n'); process.exitCode = 1; }
}
