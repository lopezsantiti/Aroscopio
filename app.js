// Aroscopio: arma las pantallas a partir de data/hoy.json y data/historial.json
(() => {
  const vista = document.getElementById('vista');
  const lateralHist = document.getElementById('resumen-historial');
  let datos = null, historial = [];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fechaLarga = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fechaCorta = (f) => new Date(f + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const hora = (iso) => iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }) + ' h' : 'Horario a confirmar';
  const dec = (n) => n == null ? '–' : n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // Los datos se actualizan una vez por día: si el partido ya empezó, lo decimos en vez de mostrar un estado viejo
  function estadoTexto(p) {
    if (p.estado === 'final') return 'Terminado';
    if (p.hora && Date.now() >= new Date(p.hora).getTime()) return `Empezó a las ${hora(p.hora)} · resultado mañana`;
    if (p.estado === 'en juego') return 'Empezó · resultado mañana';
    return hora(p.hora);
  }

  function marcarMenu(sec) {
    document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('activo', a.dataset.sec === sec));
  }

  function etiquetas(p) {
    const t = [];
    for (const [eq, otro] of [[p.visitante, p.local], [p.local, p.visitante]]) {
      if (eq.descanso === 0 && otro.descanso !== 0) t.push(`${eq.nombre} jugó ayer`);
    }
    for (const eq of [p.local, p.visitante]) {
      const u = eq.ultimos5 || [];
      let racha = 0;
      for (let i = u.length - 1; i >= 0 && u[i] === u[u.length - 1]; i--) racha++;
      if (racha >= 3) t.push(`${eq.nombre}: ${racha} ${u[u.length - 1] === 'G' ? 'victorias' : 'derrotas'} seguidas`);
    }
    return t.slice(0, 3);
  }

  function tarjetaPartido(p) {
    const pl = p.probLocal, pv = 100 - pl;
    const final = p.estado === 'final';
    const derecha = final
      ? `<span class="chip ${p.acierto ? 'ok' : 'mal'}">${p.acierto ? 'El modelo acertó' : 'El modelo falló'}</span>`
      : `<span class="ver">Ver análisis ›</span>`;
    const estado = estadoTexto(p);
    const pts = (eq, n) => final ? ` · ${n} puntos` : ` · ${eq}`;
    const chips = etiquetas(p).map((x) => `<span class="chip">${esc(x)}</span>`).join('');
    return `<a class="partido" href="#partido-${p.id}">
      <div class="partido-arriba"><span>${esc(estado)}</span>${derecha}</div>
      <div class="equipos">
        <span class="nombre">${esc(p.visitante.nombre)} <small>${esc(p.visitante.record)}${pts('visitante', p.marcador?.visitante)}</small></span>
        <span class="pct v">${pv}%</span>
        <span class="nombre">${esc(p.local.nombre)} <small>${esc(p.local.record)}${pts('local', p.marcador?.local)}</small></span>
        <span class="pct l">${pl}%</span>
      </div>
      <div class="barra-prob" aria-hidden="true"><div class="v" style="width:${pv}%"></div><div class="l"></div></div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </a>`;
  }

  function verDia(cual) {
    marcarMenu('hoy');
    const fecha = datos.dias[cual];
    const lista = datos.partidos.filter((p) => p.fecha === fecha);
    const titulos = { ayer: 'Partidos de ayer', hoy: 'Partidos de hoy', manana: 'Partidos de mañana' };
    document.title = `Aroscopio · ${titulos[cual]}`;
    const tab = (k, t) => `<a href="#${k}" class="${k === cual ? 'activo' : ''}">${t}</a>`;
    vista.innerHTML = `
      <div class="encabezado">
        <div>
          <p class="lema">Nada de horóscopo: datos.</p>
          <h1>${titulos[cual]}</h1>
          <p class="subtitulo">${esc(fechaLarga(fecha))} · horarios de Argentina</p>
        </div>
        <nav class="dias" aria-label="Elegir día">${tab('ayer', 'Ayer')}${tab('hoy', 'Hoy')}${tab('manana', 'Mañana')}</nav>
      </div>
      ${lista.length ? lista.map(tarjetaPartido).join('') : `<div class="vacio">No hay partidos de la NBA para este día.</div>`}`;
  }

  function verPartido(id) {
    marcarMenu('hoy');
    const p = datos.partidos.find((x) => String(x.id) === id);
    if (!p) { vista.innerHTML = `<a class="volver" href="#hoy">‹ Partidos de hoy</a><div class="vacio">Este partido ya no está en la lista. Mirá los partidos de hoy.</div>`; return; }
    const L = p.local, V = p.visitante, pl = p.probLocal, pv = 100 - pl;
    const final = p.estado === 'final';
    const diaVuelta = p.fecha === datos.dias.ayer ? 'ayer' : p.fecha === datos.dias.manana ? 'manana' : 'hoy';
    const nombresDia = { ayer: 'Partidos de ayer', hoy: 'Partidos de hoy', manana: 'Partidos de mañana' };
    document.title = `Aroscopio · ${V.nombre} en ${L.nombre}`;
    const fav = pl >= 50 ? L.nombre : V.nombre;
    const favPct = Math.max(pl, pv);

    const cabeza = final
      ? `<p class="tenue">${esc(fechaLarga(p.fecha))} · Terminado: ${esc(V.nombre)} ${p.marcador.visitante}, ${esc(L.nombre)} ${p.marcador.local}</p>`
      : `<p class="tenue">${esc(fechaLarga(p.fecha))} · ${esc(estadoTexto(p))} · en la cancha de ${esc(L.nombre)}</p>`;

    const factores = final
      ? `<p>Antes del partido el modelo le daba <b>${favPct}%</b> a ${esc(fav)}. ${p.acierto ? 'Acertó.' : 'Falló: ganó el que tenía menos chances.'}</p>
         <p class="tenue">Para los partidos terminados mostramos lo que el modelo dijo antes de jugarse, sin retoques.</p>`
      : p.factores.map((f) => {
          const quien = f.efecto > 0 ? L.nombre : V.nombre;
          const color = f.efecto > 0 ? 'var(--naranja-txt)' : f.efecto < 0 ? 'var(--azul-txt)' : 'var(--tenue)';
          const txt = f.efecto === 0 ? '0' : `${esc(quien)} +${Math.abs(f.efecto)}`;
          return `<div class="factor"><span><b>${esc(f.nombre)}</b></span><b style="color:${color}">${txt}</b><span class="nota">${esc(f.nota)}</span></div>`;
        }).join('');

    const filas = [
      ['Récord', V.record, L.record],
      ['Últimos 10', V.ultimos10, L.ultimos10],
      ['Visitante / local', V.deVisitante, L.enCasa],
      ['Puntos a favor', dec(V.puntosFavor), dec(L.puntosFavor)],
      ['Puntos en contra', dec(V.puntosContra), dec(L.puntosContra)],
      ['Días de descanso', V.descanso ?? '–', L.descanso ?? '–']
    ].map(([e, v, l]) => `<div class="comp"><b>${esc(v)}</b><span>${e}</span><b>${esc(l)}</b></div>`).join('');

    const forma = (eq) => `<div class="forma"><span class="quien">${esc(eq.nombre)}</span>${(eq.ultimos5 || []).map((r) => `<span class="res ${r}">${r}</span>`).join('') || '<span class="tenue">Sin partidos todavía</span>'}</div>`;
    const cara = p.cara.length
      ? 'Esta temporada: ' + p.cara.map((c) => `${esc(c.visitante)} ${c.pv}, ${esc(c.local)} ${c.pl} (${esc(fechaCorta(c.fecha))})`).join(' · ')
      : 'Todavía no se enfrentaron esta temporada.';

    vista.innerHTML = `
      <a class="volver" href="#${diaVuelta}">‹ ${nombresDia[diaVuelta]}</a>
      <section class="grande">
        ${cabeza}
        <div class="duelo">
          <div><div class="tenue">Visitante · ${esc(V.record)}</div><div class="equipo">${esc(V.nombre)}</div><div class="numero" style="color:var(--azul-txt)">${pv}%</div></div>
          <div class="vs">vs</div>
          <div class="der"><div class="tenue">Local · ${esc(L.record)}</div><div class="equipo">${esc(L.nombre)}</div><div class="numero" style="color:var(--naranja-txt)">${pl}%</div></div>
        </div>
        <div class="barra-prob" aria-hidden="true"><div class="v" style="width:${pv}%"></div><div class="l"></div></div>
        <p class="tenue" style="margin-top:12px">Probabilidad de ganar según el modelo${final ? ', calculada antes del partido' : ''}.</p>
      </section>
      <div class="dos">
        <section class="tarjeta">
          <h2 class="mayor">${final ? 'Qué dijo el modelo' : `Por qué ${favPct}% para ${esc(fav)}`}</h2>
          ${final ? '' : '<p class="tenue" style="margin-bottom:14px">Cuántos puntos de probabilidad suma cada factor, partiendo de 50 y 50.</p>'}
          ${factores}
        </section>
        <section class="tarjeta">
          <h2 class="mayor" style="margin-bottom:14px">Cara a cara</h2>
          <div class="comp cab"><span style="text-align:left">${esc(V.nombre)}</span><span></span><span style="text-align:right">${esc(L.nombre)}</span></div>
          ${filas}
          <h3 style="font-size:16px;margin-top:20px">Últimos 5 partidos</h3>
          ${forma(V)}${forma(L)}
          <p class="tenue" style="margin-top:14px">G = ganó · P = perdió · el más reciente a la derecha. ${cara}</p>
        </section>
      </div>
      <section class="tarjeta bloqueado">
        <div class="encabezado"><h2 class="mayor">Proyección por jugador</h2><span class="etiqueta-oscura" style="background:var(--naranja);color:var(--fondo)">Pro</span></div>
        <div class="fantasma" aria-hidden="true">${[80, 60, 45, 55, 70, 50, 40, 65].map((w) => `<i style="width:${w}%"></i>`).join('')}</div>
        <div class="candado">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="#ff8a33" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#ff8a33" stroke-width="2"/></svg>
          <p>Puntos, rebotes y asistencias esperados de cada jugador en este partido. Llega con Aroscopio Pro.</p>
          <a class="boton-oscuro" style="background:var(--naranja);color:var(--fondo)" href="https://www.instagram.com/aroscopio/" rel="noopener">Enterate en Instagram</a>
        </div>
      </section>`;
    window.scrollTo(0, 0);
  }

  function resumen() {
    const resueltos = historial.filter((h) => h.resultado);
    const aciertos = resueltos.filter((h) => h.acierto).length;
    const ayer = resueltos.filter((h) => h.fecha === datos.dias.ayer);
    const semana = resueltos.filter((h) => h.fecha >= sumarDias(datos.dias.hoy, -7));
    const ph = datos.pruebaHaciaAtras;
    const prueba = ph && ph.partidos
      ? `<p class="tenue">Prueba hacia atrás: con los ${ph.partidos} partidos ya jugados esta temporada, el modelo habría acertado ${Math.round(ph.aciertos / ph.partidos * 100)}%.</p>`
      : '';
    return { resueltos, aciertos, ayer, semana, prueba };
  }

  function pintarLateral() {
    const r = resumen();
    const cuenta = (lista) => `${lista.filter((h) => h.acierto).length} de ${lista.length}`;
    lateralHist.innerHTML = r.resueltos.length
      ? `<h2>Historial del modelo</h2>
         <p class="tenue" style="margin-bottom:14px">Cada predicción se guarda antes del partido. Sin borrar nada.</p>
         <div class="cifra">${Math.round(r.aciertos / r.resueltos.length * 100)}%</div>
         <p class="tenue" style="margin-top:6px">de aciertos en ${r.resueltos.length} partidos</p>
         <div class="mini"><div><span>Ayer</span><b>${cuenta(r.ayer)}</b></div><div><span>Última semana</span><b>${cuenta(r.semana)}</b></div></div>
         <p style="margin-top:14px"><a href="#historial">Ver todos los resultados ›</a></p>`
      : `<h2>Historial del modelo</h2>
         <p>El historial arranca ahora. Cada predicción queda guardada antes del partido y después mostramos si acertó, sin borrar nada.</p>
         ${r.prueba}`;
  }

  function verHistorial() {
    marcarMenu('historial');
    document.title = 'Aroscopio · Historial del modelo';
    const r = resumen();
    const filas = [...historial].reverse().map((h) => {
      const favLocal = h.probLocal >= 50;
      const fav = favLocal ? h.local : h.visitante;
      const pct = favLocal ? h.probLocal : 100 - h.probLocal;
      const res = h.resultado ? `${esc(h.visitante)} ${h.resultado.visitante} – ${esc(h.local)} ${h.resultado.local}` : 'Por jugarse';
      const ok = h.resultado ? `<span class="chip ${h.acierto ? 'ok' : 'mal'}">${h.acierto ? 'Acertó' : 'Falló'}</span>` : '';
      return `<tr><td class="num">${esc(fechaCorta(h.fecha))}</td><td>${esc(h.visitante)} en ${esc(h.local)}</td><td>${esc(fav)} ${pct}%</td><td>${res}</td><td>${ok}</td></tr>`;
    }).join('');
    vista.innerHTML = `
      <div><p class="lema">Sin trampa</p><h1>Historial del modelo</h1>
      <p class="subtitulo">Todas las predicciones, guardadas antes de cada partido. Las buenas y las malas.</p></div>
      <div class="tarjeta">
        ${r.resueltos.length ? `<div class="cifra">${Math.round(r.aciertos / r.resueltos.length * 100)}%</div><p class="tenue" style="margin-top:6px">${r.aciertos} aciertos en ${r.resueltos.length} partidos terminados</p>` : '<p>Todavía no terminó ningún partido desde que arrancamos.</p>'}
        ${r.prueba ? `<div style="margin-top:12px">${r.prueba}</div>` : ''}
      </div>
      ${historial.length ? `<div class="tarjeta scroll"><table class="tabla"><thead><tr><th>Fecha</th><th>Partido</th><th>Favorito</th><th>Resultado</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>` : ''}`;
  }

  function verComoFunciona() {
    marcarMenu('como-funciona');
    document.title = 'Aroscopio · Cómo funciona';
    vista.innerHTML = `<div class="texto-largo">
      <p class="lema">Nada de horóscopo: datos.</p>
      <h1>Cómo funciona</h1>
      <p>Aroscopio calcula la chance de ganar de cada equipo de la NBA con un sistema de puntaje llamado Elo, el mismo tipo de sistema que se usa en el ajedrez.</p>
      <h2>1. Nivel de cada equipo</h2>
      <p>Cada equipo tiene un puntaje que sube cuando gana y baja cuando pierde. Ganarle a un equipo fuerte, o ganar por mucho, suma más. Usamos los resultados de esta temporada y de la anterior.</p>
      <h2>2. Localía</h2>
      <p>Jugar en casa ayuda. El modelo le suma una ventaja fija al local.</p>
      <h2>3. Descanso</h2>
      <p>Un equipo que jugó el día anterior llega más cansado. El modelo le resta un poco.</p>
      <h2>Lo que todavía no mira</h2>
      <p>Las lesiones y las bajas de último momento. Por eso, antes de sacar conclusiones, conviene chequear quién juega.</p>
      <h2>Por qué mostramos el historial</h2>
      <p>Cualquiera puede decir que acierta. Nosotros guardamos cada predicción antes del partido y la dejamos publicada, acierte o falle. Ningún modelo adivina el futuro: un 60% significa que, de cada 10 partidos así, el favorito pierde unos 4.</p>
      <p class="tenue">Aroscopio es información. No es una casa de apuestas, no recomienda apostar y es solo para mayores de 18 años.</p>
    </div>`;
  }

  function ruta() {
    if (!datos) return;
    const h = location.hash.slice(1) || 'hoy';
    if (h === 'ayer' || h === 'hoy' || h === 'manana') verDia(h);
    else if (h.startsWith('partido-')) verPartido(h.slice(8));
    else if (h === 'historial') verHistorial();
    else if (h === 'como-funciona') verComoFunciona();
    else verDia('hoy');
  }

  async function cargar() {
    try {
      const v = '?v=' + Date.now();
      const [r1, r2] = await Promise.all([fetch('data/hoy.json' + v), fetch('data/historial.json' + v)]);
      datos = await r1.json();
      historial = r2.ok ? await r2.json() : [];
      if (!datos.partidos || !datos.dias) throw new Error('sin datos');
      // En los partidos terminados mostramos la predicción que quedó guardada antes del partido
      const guardadas = new Map(historial.map((h) => [h.id, h]));
      for (const p of datos.partidos) {
        const h = guardadas.get(p.id);
        if (p.estado === 'final' && h && h.resultado) { p.probLocal = h.probLocal; p.acierto = h.acierto; }
      }
      pintarLateral();
      ruta();
    } catch (e) {
      vista.innerHTML = '<div class="vacio">Todavía no hay datos cargados. Volvé en un rato: se actualizan solos todos los días.</div>';
      lateralHist.innerHTML = '<h2>Historial del modelo</h2><p class="tenue">Arranca con la primera actualización.</p>';
    }
  }

  window.addEventListener('hashchange', ruta);
  cargar();
})();
