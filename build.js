// Gera a versão leve em ./dist: JS/CSS minificados, boot.js embutido no HTML, assets copiados. Uso: node build.js
const fs = require('fs'), path = require('path');
let esbuild;
try { esbuild = require('esbuild'); } catch { console.error('Falta o esbuild. Rode:  npm i -D esbuild'); process.exit(1); }
const src = (...p) => path.join(__dirname, ...p);            // tudo relativo à pasta do build.js (funciona de qualquer cwd)
const out = src('dist'); fs.mkdirSync(out, { recursive: true });
const min = (f, loader) => esbuild.transformSync(fs.readFileSync(src(f), 'utf8'), { loader, minify: true, legalComments: 'none', charset: 'utf8' }).code;
const sizes = [];
const JS = ['shared.js', 'p2p.js', 'cutscene.js', 'game.js', 'touch.js', 'menu-dc.js'];
for (const f of JS) {
  if (!fs.existsSync(src(f))) { console.warn('AVISO: ' + f + ' não encontrado, pulado'); continue; }
  const c = min(f, 'js'); fs.writeFileSync(path.join(out, f), c); sizes.push([f, fs.statSync(src(f)).size, Buffer.byteLength(c)]);
}
for (const f of ['style.css', 'touch.css', 'menu-dc.css']) {
  if (!fs.existsSync(src(f))) { console.warn('AVISO: ' + f + ' não encontrado, pulado'); continue; }
  const c = min(f, 'css'); fs.writeFileSync(path.join(out, f), c); sizes.push([f, fs.statSync(src(f)).size, Buffer.byteLength(c)]);
}
let html = fs.readFileSync(src('index.html'), 'utf8');
const BOOT_TAG = '<script src="boot.js"></script>';
if (!html.includes(BOOT_TAG)) console.warn('AVISO: ' + BOOT_TAG + ' não está no index.html; o boot NÃO foi embutido');
html = html.replace(BOOT_TAG, () => '<script>' + min('boot.js', 'js') + '</script>').replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*\n/g, '\n');
fs.writeFileSync(path.join(out, 'index.html'), html); sizes.push(['index.html', fs.statSync(src('index.html')).size, Buffer.byteLength(html)]);
// copia imagens, áudios, fontes e manifest da raiz para o dist
const ASSET = /\.(png|jpg|jpeg|gif|webp|svg|ico|mp3|ogg|wav|woff2?|ttf|otf|webmanifest)$/i;
for (const f of fs.readdirSync(__dirname)) if (ASSET.test(f)) fs.copyFileSync(src(f), path.join(out, f));
// sprite/ e sprites/ (o game.js procura em sprites/, depois sprite/, depois na raiz), music/ e fonts/: copiadas inteiras, com subpastas
for (const d of ['sprites', 'sprite', 'music', 'fonts']) if (fs.existsSync(src(d))) fs.cpSync(src(d), path.join(out, d), { recursive: true, filter: s => !/(^|[\\/])\.[^\\/]+$/.test(s) });
let a = 0, b = 0; for (const [f, x, y] of sizes) { a += x; b += y; console.log(f.padEnd(14), String(x).padStart(7), '->', String(y).padStart(7)); }
console.log('TOTAL'.padEnd(14), String(a).padStart(7), '->', String(b).padStart(7));
