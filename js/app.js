// Armazón de la aplicación: menú por perfil, enrutador por hash, reloj y colapso del menú.
(function () {
  'use strict';
  const { esc, icono, fmt } = window.U;

  const PERFILES = {
    analista: { label: 'Analista de facturación', inicio: 'panel' },
    jefe: { label: 'Jefe de facturación', inicio: 'por-aprobar' },
    auditor: { label: 'Auditor (externo)', inicio: 'subir' },
    cliente: { label: 'Cliente', inicio: 'devoluciones' },
  };

  const porAprobar = () => window.DB.reporte.filter((r) => r.estado === 'pendiente_aprobacion').length;

  const MENU = [
    { grupo: 'Operación', perfiles: ['analista', 'jefe'], items: [
      { ruta: 'panel', label: 'Panel general', icono: 'panel' },
      { ruta: 'casos', label: 'Casos', icono: 'casos' },
    ] },
    { grupo: 'Flujos', perfiles: ['analista', 'jefe'], items: [
      { ruta: 'despacho', label: 'Despacho', icono: 'camion' },
      { ruta: 'postdescarga', label: 'Post descarga', icono: 'descarga' },
    ] },
    { grupo: 'Aprobaciones', perfiles: ['analista', 'jefe'], items: [
      { ruta: 'por-aprobar', label: 'Por aprobar', icono: 'aprobar', cuenta: porAprobar },
    ] },
    { grupo: 'SAP', perfiles: ['analista'], items: [
      { ruta: 'facturacion', label: 'Facturación diaria', icono: 'calendario' },
      { ruta: 'documentos', label: 'Documentos SAP', icono: 'sap' },
    ] },
    { grupo: 'Portal auditor', perfiles: ['auditor'], items: [
      { ruta: 'subir', label: 'Subir reporte', icono: 'subir' },
      { ruta: 'envios', label: 'Mis envíos', icono: 'envios' },
    ] },
    { grupo: 'Mi portal', perfiles: ['cliente'], items: [
      { ruta: 'devoluciones', label: 'Mis devoluciones', icono: 'devoluciones' },
    ] },
    { grupo: 'Analítica', perfiles: ['analista', 'jefe'], items: [
      { ruta: 'dashboard', label: 'Dashboard', icono: 'dashboard' },
    ] },
  ];

  // Preferencias por visitante (opcionales: la app funciona sin ellas).
  const pref = {
    get(k, def) { try { return localStorage.getItem('ncavv.' + k) ?? def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem('ncavv.' + k, v); } catch { /* sin almacenamiento */ } },
  };

  const estado = {
    perfil: PERFILES[pref.get('perfil')] ? pref.get('perfil') : 'analista',
    colapsado: pref.get('colapsado') === '1',
  };

  const app = document.getElementById('app');

  function rutasDelPerfil(perfil) {
    return MENU.filter((g) => g.perfiles.includes(perfil)).flatMap((g) => g.items.map((i) => i.ruta));
  }

  function leerRuta() {
    const h = location.hash.replace(/^#\/?/, '');
    const [ruta, ...params] = h.split('/').filter(Boolean);
    return { ruta: ruta || PERFILES[estado.perfil].inicio, params };
  }

  function menuHtml(rutaActual) {
    const grupos = MENU.filter((g) => g.perfiles.includes(estado.perfil));
    const activa = rutaActual === 'caso' ? 'casos' : rutaActual;
    return grupos.map((g) => `
      <div class="menu__grupo">
        <div class="menu__titulo">${esc(g.grupo)}</div>
        ${g.items.map((i) => {
          const n = i.cuenta ? i.cuenta() : 0;
          return `<a class="menu__item" href="#/${i.ruta}" title="${esc(i.label)}" ${i.ruta === activa ? 'aria-current="page"' : ''}>
            ${icono(i.icono)}<span>${esc(i.label)}</span>${n ? `<b class="cuenta" aria-label="${n} pendientes">${n}</b>` : ''}
          </a>`;
        }).join('')}
      </div>`).join('');
  }

  function shell() {
    app.innerHTML = `
      <aside class="menu" id="menu" aria-label="Menú principal">
        <button class="menu__colapsar" id="btn-colapsar" type="button" aria-label="Colapsar menú" aria-expanded="true">‹</button>
        <div class="marca">
          <img src="assets/logo.svg" alt="San Fernando">
          <div class="marca__texto">
            <div class="marca__nombre">Notas de Crédito AVV</div>
            <div class="marca__sub">San Fernando · MVP</div>
          </div>
        </div>
        <nav class="menu__nav" id="menu-nav"></nav>
        <div class="menu__pie"><p class="menu__frase" style="margin:0">Cada nota de crédito, a tiempo y sin duplicados.</p></div>
      </aside>
      <div class="velo" id="velo"></div>
      <main class="principal" id="principal">
        <div class="contenedor">
          <header class="encabezado">
            <div class="encabezado__fila">
              <button class="hamburguesa" id="btn-menu" type="button" aria-label="Abrir menú" aria-controls="menu">${icono('menu')}</button>
              <div class="encabezado__txt">
                <h1 id="titulo"></h1>
                <p id="subtitulo"></p>
              </div>
            </div>
            <div class="encabezado__acciones">
              <div class="perfil">
                <label for="sel-perfil">Ver como</label>
                <select id="sel-perfil">
                  ${Object.entries(PERFILES).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('')}
                </select>
              </div>
              <div class="reloj" aria-label="Fecha y hora actual"><span class="reloj__punto"></span><span id="reloj"></span></div>
            </div>
          </header>
          <div class="zigzag" aria-hidden="true"></div>
          <div id="vista" class="contenedor" style="gap:30px"></div>
        </div>
      </main>`;

    document.getElementById('sel-perfil').value = estado.perfil;
    document.getElementById('sel-perfil').addEventListener('change', (e) => {
      estado.perfil = e.target.value;
      pref.set('perfil', estado.perfil);
      location.hash = '#/' + PERFILES[estado.perfil].inicio;
      render();
    });
    document.getElementById('btn-colapsar').addEventListener('click', () => {
      estado.colapsado = !estado.colapsado;
      pref.set('colapsado', estado.colapsado ? '1' : '0');
      aplicarColapso();
    });
    document.getElementById('btn-menu').addEventListener('click', () => app.classList.add('menu-abierto'));
    document.getElementById('velo').addEventListener('click', cerrarMenuMovil);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenuMovil(); });
    aplicarColapso();
  }

  function cerrarMenuMovil() { app.classList.remove('menu-abierto'); }

  function aplicarColapso() {
    app.classList.toggle('colapsado', estado.colapsado);
    const b = document.getElementById('btn-colapsar');
    b.setAttribute('aria-expanded', String(!estado.colapsado));
    b.setAttribute('aria-label', estado.colapsado ? 'Expandir menú' : 'Colapsar menú');
  }

  function render() {
    let { ruta, params } = leerRuta();
    // Si la ruta no corresponde al perfil, ir a su inicio (el detalle de caso es visible para todos).
    if (ruta !== 'caso' && !rutasDelPerfil(estado.perfil).includes(ruta)) {
      ruta = PERFILES[estado.perfil].inicio;
      history.replaceState(null, '', '#/' + ruta);
    }
    document.getElementById('menu-nav').innerHTML = menuHtml(ruta);
    const pagina = (window.Pages[ruta] || window.Pages.pendiente)({ ruta, params, perfil: estado.perfil });
    document.getElementById('titulo').textContent = pagina.titulo;
    document.getElementById('subtitulo').textContent = pagina.subtitulo || '';
    document.getElementById('vista').innerHTML = pagina.html;
    document.title = `${pagina.titulo} · Notas de Crédito AVV`;
    cerrarMenuMovil();
    window.scrollTo(0, 0);
  }

  function reloj() {
    const el = document.getElementById('reloj');
    const tick = () => { el.textContent = fmt.reloj(new Date()); };
    tick();
    setInterval(tick, 1000);
  }

  shell();
  reloj();
  window.addEventListener('hashchange', render);
  render();
})();
