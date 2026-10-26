// Pone ?v=<versión> en los CSS y JS locales de index.html para que el navegador no use archivos viejos
// de la caché (GitHub Pages los guarda hasta 10 minutos). Correr antes de cada commit que cambie CSS/JS.
// Uso: node scripts/sellar-version.js
'use strict';
const fs = require('fs');
const path = require('path');

const archivo = path.join(__dirname, '..', 'index.html');
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const version = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;

const html = fs.readFileSync(archivo, 'utf8').replace(
  /((?:src|href)="(?:css|js|data)\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g,
  `$1?v=${version}"`,
);
fs.writeFileSync(archivo, html);
console.log(`index.html sellado con v=${version}`);
