// Empaqueta el prototipo en un único HTML (CSS, datos, JS y logo en línea) para compartirlo.
// Uso: node scripts/empaquetar.js [salida.html]   (por defecto: dist/notas-credito-avv.html)
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const salida = path.resolve(process.argv[2] || path.join(raiz, 'dist', 'notas-credito-avv.html'));
const leer = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const index = leer('index.html');
const fuentes = index.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const scripts = [...index.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const logo = 'data:image/svg+xml;base64,' + Buffer.from(leer('assets/logo.svg')).toString('base64');

// Sin <html>/<head>/<body>: el visor de Artifacts agrega el esqueleto.
const html = [
  '<title>Notas de Crédito AVV</title>',
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  fuentes,
  `<style>\n${leer('css/styles.css')}\n</style>`,
  '<div id="app" class="app"></div>',
  ...scripts.map((s) => `<script>\n${leer(s).replace(/<\/script/gi, '<\\/script').replaceAll('assets/logo.svg', logo)}\n</script>`),
].join('\n');

fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, html);
console.log(`Escrito ${salida} (${(html.length / 1024).toFixed(0)} KB)`);
