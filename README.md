# Plataforma de Notas de Crédito AVV · San Fernando (prototipo)

Prototipo navegable para gestionar las notas de crédito por mortalidad de aves vivas (AVV):
reporte del auditor → cruce con facturas SAP → aprobación (post descarga) → documentos SAP → NC/SUNAT → correo al auditor.
Sin backend: todo corre en el navegador con datos ficticios.

## Cómo verlo

Abrir `index.html` en el navegador (doble clic). No necesita servidor ni instalación.
Si se prefiere un servidor local: `python3 -m http.server 8000` y abrir <http://localhost:8000>.

Arriba a la derecha, **Ver como** cambia el perfil (analista, jefe, auditor, cliente) y con él el menú.

## Estructura

```
index.html            Punto de entrada
css/styles.css        Estilos (variables de diseño en :root)
js/util.js            Formatos es-PE, estados, normalización de razón social, íconos
js/store.js           Consultas sobre las tablas (equivalentes a vistas SQL)
js/components.js      Componentes: KPI, encabezados de sección, línea de tiempo del caso
js/pages/*.js         Una pantalla por archivo
js/app.js             Menú por perfil, enrutador (#/ruta), reloj
data/*.js             Datos ficticios, una tabla por archivo
scripts/generar-datos.js  Regenera data/*.js (node scripts/generar-datos.js)
scripts/empaquetar.js     Genera un único HTML para compartir
assets/logo.svg       Marcador de posición del logo (reemplazar por el oficial)
```

## Datos (forma de tablas SQL)

| Tabla | Filas | Contenido |
| --- | --- | --- |
| `reporte` | 12 | Casos: 8 despacho, 4 post descarga, en distintos estados |
| `registro` | 81 | Filas del Excel del auditor (camión × sexo) |
| `factura_sap` | 299 | BBDD de facturas (FA), NC (07-) y ND (08-) |
| `cruce` | 67 | Resultado del cruce por registro |
| `aprobacion` | 2 | % de aprobación del jefe (post descarga) |
| `documento_sap` | 194 | Pedido, entrega, traslado, NC y SUNAT por registro |
| `evento` | 59 | Línea de tiempo de cada caso |
| `correo` | 4 | Correos de NC enviados (con sus filas) |
| `extraccion_sap` | 25 | Cargas diarias ZSDR005 (con huecos y duplicados) |
| `cliente`, `auditor`, `usuario` | | Maestros |

Los datos son inventados. Las reglas marcadas "por confirmar" (secuencia de etapas SAP, fórmula de V.NET/DEV) son supuestos del prototipo.
