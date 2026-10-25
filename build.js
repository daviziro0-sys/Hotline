// Gera a versão leve em ./dist: JS/CSS minificados, boot.js embutido no HTML, assets copiados. Uso: node build.js
const fs = require('fs'), path = require('path');
const esbuild = require('esbuild');
const out = path.join(__dirname, 'dist'); fs.mkdirSync(out, { recursive: true });
const min = (f, loader) => esbuild.transformSync(fs.readFileSync(f, 'utf8'), { loader, minify: true, legalComments: 'none' }).code;
const sizes = [];
for (const f of ['shared.js', 'p2p.js', 'game.js', 'touch.js', 'menu-dc.js']) { const c = min(f, 'js'); fs.writeFileSync(path.join(out, f), c); sizes.push([f, fs.statSync(f).size, Buffer.byteLength(c)]); }
for (const f of ['style.css', 'touch.css', 'menu-dc.css']) { const c = min(f, 'css'); fs.writeFileSync(path.join(out, f), c); sizes.push([f, fs.statSync(f).size, Buffer.byteLength(c)]); }
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<script src="boot.js"></script>', () => '<script>' + min('boot.js', 'js') + '</script>').replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*\n/g, '\n');
fs.writeFileSync(path.join(out, 'index.html'), html); sizes.push(['index.html', fs.statSync('index.html').size, Buffer.byteLength(html)]);
// copia imagens e áudios (e a pasta music/, se existir) para o dist
for (const f of fs.readdirSync(__dirname)) if (/\.(png|jpg|jpeg|gif|webp|mp3|ogg|wav)$/i.test(f)) fs.copyFileSync(path.join(__dirname, f), path.join(out, f));
// sprites/: copiada para dist/sprites, que é onde o game.js procura primeiro (a raiz fica como reserva)
const spr = path.join(__dirname, 'sprites');
if (fs.existsSync(spr)) { fs.mkdirSync(path.join(out, 'sprites'), { recursive: true }); for (const f of fs.readdirSync(spr)) if (/\.(png|jpg|jpeg|gif|webp)$/i.test(f)) fs.copyFileSync(path.join(spr, f), path.join(out, 'sprites', f)); }
if (fs.existsSync(path.join(__dirname, 'music'))) fs.cpSync(path.join(__dirname, 'music'), path.join(out, 'music'), { recursive: true });
let a = 0, b = 0; for (const [f, x, y] of sizes) { a += x; b += y; console.log(f.padEnd(14), String(x).padStart(7), '->', String(y).padStart(7)); }
console.log('TOTAL'.padEnd(14), String(a).padStart(7), '->', String(b).padStart(7));
