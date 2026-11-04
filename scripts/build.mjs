import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'wallet.js', 'assets']) {
  await cp(join(root, file), join(output, file), { recursive: true });
}
const html = await readFile(join(output, 'index.html'), 'utf8');
if (/\b(?:src|href)=["']\/(?!\/)/.test(html)) throw new Error('Root-relative asset URL in export');
async function bytes(dir) {
  let size = 0;
  for (const file of await readdir(dir)) {
    const path = join(dir, file), info = await stat(path);
    size += info.isDirectory() ? await bytes(path) : info.size;
  }
  return size;
}
console.log(`Production export: dist/ (${await bytes(output)} bytes). No runtime dependencies.`);
