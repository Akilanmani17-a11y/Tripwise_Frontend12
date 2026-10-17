/* TripWise — client app
   Data: Open-Meteo Geocoding (places), Open-Meteo Forecast (weather),
   Wikipedia / Wikimedia (photos, summaries, nearby sights), OpenStreetMap (maps). */
(() => {
  'use strict';
  // Preview build: the preview host blocks browser storage, so this copy keeps data in memory.
  const memStore = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } }; })();
  const memSession = memStore;

  const GEO = 'https://geocoding-api.open-meteo.com/v1';
  const WX = 'https://api.open-meteo.com/v1/forecast';
  const WIKI = 'https://en.wikipedia.org/w/api.php';
  const TRIP_KEY = 'tripwise-trip-v2';
  const OLD_KEY = 'tripwise-itinerary';
  const IMG_KEY = 'tripwise-img-v2';

  /* ---------------- categories ---------------- */
  const CATS = [
    { id: 'trending', label: 'Trending', icon: 'flame', color: 'var(--c-trending)', title: 'Trending this season', sub: 'Places people keep coming back to.',
      list: 'Kyoto JP|Lisbon PT|Reykjavik IS|Cape Town ZA|Mexico City MX|Istanbul TR|Seoul KR|Marrakesh MA|Buenos Aires AR|Hanoi VN|Edinburgh GB|Queenstown NZ' },
    { id: 'beach', label: 'Beaches', icon: 'tree-palm', color: 'var(--c-beach)', title: 'Sand, sea, slow mornings', sub: 'Coastal cities and beach towns with warm water nearby.',
      list: 'Rio de Janeiro BR|Honolulu US|Nice FR|Cancun MX|Sydney AU|Phuket TH|Varkala IN|Durban ZA|Split HR|Tulum MX|Krabi TH|Puducherry IN' },
    { id: 'mountain', label: 'Mountains', icon: 'mountain-snow', color: 'var(--c-mountain)', title: 'Thin air, big views', sub: 'Base camps, alpine villages and hill stations.',
      list: 'Interlaken CH|Zermatt CH|Banff CA|Chamonix FR|Manali IN|Kathmandu NP|Cusco PE|Innsbruck AT|Leh IN|Darjeeling IN|Pokhara NP|Hallstatt AT' },
    { id: 'old', label: 'Old towns', icon: 'castle', color: 'var(--c-old)', title: 'Cobblestones and old quarters', sub: 'Walled cities, market squares and streets older than most countries.',
      list: 'Prague CZ|Dubrovnik HR|Porto PT|Bruges BE|Florence IT|Tallinn EE|Krakow PL|Seville ES|Salzburg AT|Hoi An VN|Cartagena CO|Edinburgh GB' },
    { id: 'island', label: 'Islands', icon: 'sailboat', color: 'var(--c-island)', title: 'Island time', sub: 'Ferries, lagoons and towns where the sea is always at the end of the street.',
      list: 'Ubud ID|Funchal PT|Palma ES|Male MV|Mykonos GR|Zanzibar TZ|Port Blair IN|Taormina IT|Victoria SC|Oia GR|Nadi FJ|Papeete PF' },
    { id: 'food', label: 'Food cities', icon: 'utensils-crossed', color: 'var(--c-food)', title: 'Cities to eat your way through', sub: 'Street stalls, night markets and the best breakfasts of your life.',
      list: 'Bangkok TH|Osaka JP|Lyon FR|Bologna IT|George Town MY|Lima PE|Oaxaca MX|San Sebastian ES|Chennai IN|Hyderabad IN|Taipei TW|New Orleans US' },
    { id: 'desert', label: 'Desert', icon: 'sun', color: 'var(--c-desert)', title: 'Dunes and desert light', sub: 'Red rock, golden forts and very starry nights.',
      list: 'Dubai AE|Jaisalmer IN|Wadi Musa JO|Ouarzazate MA|Luxor EG|Alice Springs AU|Las Vegas US|San Pedro de Atacama CL|Muscat OM|Doha QA|Tucson US|Merzouga MA' },
    { id: 'snow', label: 'Snow & aurora', icon: 'snowflake', color: 'var(--c-snow)', title: 'Snow, aurora and warm cabins', sub: 'Northern lights, ski runs and hot chocolate weather.',
      list: 'Tromso NO|Rovaniemi FI|Sapporo JP|Gulmarg IN|Kiruna SE|Whistler CA|St. Moritz CH|Aspen US|Akureyri IS|Quebec CA|Harbin CN|Zakopane PL' },
    { id: 'india', label: 'India', icon: 'landmark', color: 'var(--c-india)', title: 'Closer to home: India', sub: 'Palaces, backwaters, tea hills and temple towns.',
      list: 'Jaipur IN|Udaipur IN|Varanasi IN|Munnar IN|Rishikesh IN|Kochi IN|Hampi IN|Shillong IN|Mysore IN|Amritsar IN|Madurai IN|Alappuzha IN' },
  ];
  const TILES = [
    { cat: 'beach', title: 'Beaches', sub: 'Rio, Phuket, Varkala and more', wiki: 'Rio de Janeiro' },
    { cat: 'mountain', title: 'Mountains', sub: 'From Zermatt to Leh', wiki: 'Zermatt' },
    { cat: 'old', title: 'Old towns', sub: 'Prague, Porto, Hoi An', wiki: 'Prague' },
    { cat: 'food', title: 'Food cities', sub: 'Osaka, Lima, Chennai', wiki: 'Osaka' },
    { cat: 'snow', title: 'Snow & aurora', sub: 'Tromsø, Rovaniemi, Gulmarg', wiki: 'Tromsø' },
  ];
  const FALLBACK_COLORS = ['#0a8f9c', '#3f8a4a', '#b5562f', '#1d6fd8', '#d4337a', '#c98a12', '#4a7fb5', '#e07a10', '#e14b26'];
  const TRY_NAMES = ['Lisbon', 'Kyoto', 'Munnar', 'Cape Town', 'Reykjavik'];

  /* ---------------- state ---------------- */
  const state = {
    view: 'explore',
    mode: 'cat',           // 'cat' | 'search'
    cat: 'trending',
    query: '',
    items: [],
    filters: { type: 'all', climate: 'any', country: 'all' },
    sort: 'recommended',
    status: 'idle',        // loading | ready | error | none
    lastLoad: null,
  };
  const known = new Map();   // id -> place
  const wx = new Map();      // id -> {t, code, day}
  const imgs = loadJSON(IMG_KEY, {}); // id -> {s, t, a} | 0
  let trip = loadTrip();
  let current = null;        // place in detail view
  let draftNights = 2;
  let pushedPlace = false;
  let searchSeq = 0;

  /* ---------------- helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const compact = n => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const icons = () => { if (window.lucide) window.lucide.createIcons({ attrs: { 'aria-hidden': 'true' } }); };
  const flag = cc => cc ? `https://flagcdn.com/w40/${cc.toLowerCase()}.png` : '';
  const placeLine = p => [p.admin1 && p.admin1 !== p.name ? p.admin1 : '', p.country].filter(Boolean).join(', ');
  const hashStr = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const fallbackColor = p => FALLBACK_COLORS[Math.abs(hashStr(p.id)) % FALLBACK_COLORS.length];

  function loadJSON(k, d) { try { return JSON.parse(memStore.getItem(k)) ?? d; } catch { return d; } }
  function saveJSON(k, v) { try { memStore.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } }

  function km(a, b) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function localTime(tz) {
    if (!tz) return '';
    try { return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date()); } catch { return ''; }
  }
  function kind(p) {
    if (p.fcode === 'PPLC') return 'National capital';
    if (/^PPLA/.test(p.fcode)) return p.fcode === 'PPLA' ? 'Regional capital' : 'District seat';
    if (p.pop >= 1e6) return 'Major city';
    if (p.pop >= 1e5) return 'City';
    return p.pop ? 'Town' : 'Place';
  }
  async function getJSON(url, signal) {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  function norm(x) {
    return {
      id: String(x.id), name: x.name, admin1: x.admin1 || '', country: x.country || '', cc: x.country_code || '',
      lat: x.latitude, lon: x.longitude, pop: x.population || 0, fcode: x.feature_code || '', tz: x.timezone || '', elev: x.elevation ?? null,
    };
  }
  function remember(list) { list.forEach(p => known.set(p.id, p)); return list; }

  /* weather codes */
  function wmo(code, day = 1) {
    if (code == null) return { label: '', icon: 'thermometer' };
    if (code === 0) return { label: 'Clear', icon: day ? 'sun' : 'moon' };
    if (code <= 2) return { label: 'Partly cloudy', icon: day ? 'cloud-sun' : 'cloud-moon' };
    if (code === 3) return { label: 'Overcast', icon: 'cloud' };
    if (code <= 48) return { label: 'Fog', icon: 'cloud-fog' };
    if (code <= 57) return { label: 'Drizzle', icon: 'cloud-drizzle' };
    if (code <= 67) return { label: 'Rain', icon: 'cloud-rain' };
    if (code <= 77) return { label: 'Snow', icon: 'snowflake' };
    if (code <= 82) return { label: 'Showers', icon: 'cloud-rain-wind' };
    if (code <= 86) return { label: 'Snow showers', icon: 'cloud-snow' };
    return { label: 'Thunderstorm', icon: 'cloud-lightning' };
  }

  /* ---------------- trip storage ---------------- */
  function loadTrip() {
    const t = loadJSON(TRIP_KEY, null);
    if (t && Array.isArray(t.stops)) return t;
    const fresh = { name: 'My next trip', start: '', stops: [] };
    const old = loadJSON(OLD_KEY, []);
    if (Array.isArray(old) && old.length) {
      fresh.stops = old.map(x => ({ ...norm(x), nights: 2, note: '' }));
    }
    return fresh;
  }
  function saveTrip() { saveJSON(TRIP_KEY, trip); updateCounts(); }
  const inTrip = id => trip.stops.some(s => s.id === String(id));

  /* ---------------- images (Wikipedia) ---------------- */
  function saveImgs() {
    const keys = Object.keys(imgs);
    if (keys.length > 700) keys.slice(0, keys.length - 600).forEach(k => delete imgs[k]);
    saveJSON(IMG_KEY, imgs);
  }
  function candidates(p) {
    const c = [];
    if (p.admin1 && p.admin1 !== p.name) c.push(`${p.name}, ${p.admin1}`);
    if (p.country) c.push(`${p.name}, ${p.country}`);
    c.push(p.name);
    return [...new Set(c)];
  }
  const NOT_PHOTO = /(map|locat|highlight|\.svg|seal|flag|coat[_ ]of[_ ]arms|logo|emblem|montage|collage|diagram|chart)/i;
  const isPhoto = pg => pg && pg.thumbnail && !NOT_PHOTO.test(pg.pageimage || pg.thumbnail.source);
  async function wikiPages(titles, size = 800) {
    const out = {};
    for (let i = 0; i < titles.length; i += 50) {
      const chunk = titles.slice(i, i + 50);
      const u = `${WIKI}?action=query&format=json&origin=*&redirects=1&prop=pageimages|coordinates|pageprops&piprop=thumbnail|name&pithumbsize=${size}&pilimit=50&colimit=50&ppprop=disambiguation&titles=${encodeURIComponent(chunk.join('|'))}`;
      const d = await getJSON(u);
      const map = {};
      (d.query?.normalized || []).forEach(n => { map[n.from] = n.to; });
      const red = {};
      (d.query?.redirects || []).forEach(n => { red[n.from] = n.to; });
      const byTitle = {};
      Object.values(d.query?.pages || {}).forEach(pg => { if (!('missing' in pg)) byTitle[pg.title] = pg; });
      chunk.forEach(t => {
        let r = map[t] || t; r = red[r] || r;
        if (byTitle[r]) out[t] = byTitle[r];
      });
    }
    return out;
  }
  async function geoPhoto(p) {
    const u = `${WIKI}?action=query&format=json&origin=*&generator=geosearch&ggscoord=${p.lat}|${p.lon}&ggsradius=10000&ggslimit=12&prop=pageimages&piprop=thumbnail|name&pithumbsize=800`;
    const d = await getJSON(u);
    const pages = Object.values(d.query?.pages || {}).filter(isPhoto).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return pages[0] ? { s: pages[0].thumbnail.source, t: '', a: pages[0].title } : 0;
  }
  async function enrichImages(list) {
    const todo = list.filter(p => imgs[p.id] === undefined);
    if (!todo.length) return;
    const all = [...new Set(todo.flatMap(candidates))];
    let pages = {};
    try { pages = await wikiPages(all); } catch { return; }
    const misses = [];
    todo.forEach(p => {
      let hit = null;
      for (const t of candidates(p)) {
        const pg = pages[t];
        if (!pg || pg.pageprops?.disambiguation !== undefined) continue;
        const c = pg.coordinates?.[0];
        if (!c || km({ lat: c.lat, lon: c.lon }, p) > 60) continue;
        hit = pg; break;
      }
      if (hit && isPhoto(hit)) { imgs[p.id] = { s: hit.thumbnail.source, t: hit.title }; }
      else { if (hit) imgs[p.id] = { s: '', t: hit.title }; misses.push(p); }
      if (imgs[p.id]?.s) paintImage(p.id);
    });
    // fallback: nearest photographed article
    const queue = misses.slice();
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        try {
          const g = await geoPhoto(p);
          const title = imgs[p.id]?.t || '';
          imgs[p.id] = g ? { ...g, t: title } : (title ? { s: '', t: title } : 0);
        } catch { imgs[p.id] = imgs[p.id] || 0; }
        paintImage(p.id);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    saveImgs();
  }
  function mediaHTML(p, cls = '') {
    const im = imgs[p.id];
    if (im && im.s) return `<img src="${esc(im.s)}" alt="${esc(p.name)}" loading="lazy" decoding="async" class="${cls}" onload="this.classList.add('loaded')" onerror="this.remove()">`;
    if (im === 0 || (im && !im.s)) return `<div class="img-fallback" style="background:${fallbackColor(p)}" role="img" aria-label="${esc(p.name)}">${esc(p.name.charAt(0))}<small>No photo yet</small></div>`;
    return `<div class="skel" style="position:absolute;inset:0;border-radius:0"></div>`;
  }
  function paintImage(id) {
    const p = known.get(id) || trip.stops.find(s => s.id === id);
    if (!p) return;
    $$(`[data-media="${CSS.escape(id)}"]`).forEach(el => {
      const keep = el.querySelectorAll('.card-tag, .heart');
      el.innerHTML = mediaHTML(p);
      keep.forEach(k => el.appendChild(k));
    });
    const stop = trip.stops.find(s => s.id === id);
    if (stop && imgs[id]?.s && stop.img !== imgs[id].s) { stop.img = imgs[id].s; saveJSON(TRIP_KEY, trip); }
  }

  /* ---------------- weather ---------------- */
  async function loadWeather(list) {
    const todo = list.filter(p => !wx.has(p.id));
    for (let i = 0; i < todo.length; i += 50) {
      const ch = todo.slice(i, i + 50);
      const u = `${WX}?latitude=${ch.map(p => p.lat.toFixed(3)).join(',')}&longitude=${ch.map(p => p.lon.toFixed(3)).join(',')}&current=temperature_2m,weather_code,is_day&timezone=auto`;
      try {
        let d = await getJSON(u);
        if (!Array.isArray(d)) d = [d];
        d.forEach((r, j) => { if (r.current) wx.set(ch[j].id, { t: r.current.temperature_2m, code: r.current.weather_code, day: r.current.is_day }); });
      } catch { /* weather is optional */ }
    }
    paintWeather();
  }
  function tempHTML(id) {
    const w = wx.get(id);
    if (!w) return '';
    const m = wmo(w.code, w.day);
    return `<i data-lucide="${m.icon}"></i>${Math.round(w.t)}°`;
  }
  function paintWeather() {
    $$('[data-temp]').forEach(el => { const h = tempHTML(el.dataset.temp); if (h) { el.innerHTML = h; el.title = wmo(wx.get(el.dataset.temp).code).label; } });
    icons();
    if (state.sort === 'warm' || state.sort === 'cool' || state.filters.climate !== 'any') renderGrid();
  }

  /* ---------------- loading data ---------------- */
  async function loadCategory(id) {
    const cat = CATS.find(c => c.id === id) || CATS[0];
    Object.assign(state, { mode: 'cat', cat: cat.id, query: '' });
    $('#resultsTitle').textContent = cat.title;
    $('#resultsSub').textContent = cat.sub;
    $('#miniSearchText').textContent = 'Search any city or town';
    renderCats();
    state.lastLoad = () => loadCategory(id);
    const seq = ++searchSeq;
    const cacheKey = 'tw-cat-' + cat.id;
    const cached = loadSession(cacheKey);
    if (cached) return finishLoad(seq, cached);
    setStatus('loading');
    try {
      const parts = cat.list.split('|').map(s => { const i = s.lastIndexOf(' '); return [s.slice(0, i), s.slice(i + 1)]; });
      const res = await Promise.all(parts.map(([n, cc]) =>
        getJSON(`${GEO}/search?name=${encodeURIComponent(n)}&count=1&language=en&format=json&countryCode=${cc}`).then(d => d.results?.[0]).catch(() => null)));
      const list = res.filter(Boolean).map(norm);
      if (!list.length) throw new TypeError('network');
      saveSession(cacheKey, list);
      finishLoad(seq, list);
    } catch (e) { if (seq === searchSeq) setStatus('error', e); }
  }
  async function runSearch(q) {
    q = q.trim();
    if (!q) { loadCategory(state.cat || 'trending'); return; }
    Object.assign(state, { mode: 'search', query: q });
    renderCats();
    $('#resultsTitle').textContent = `Places called “${q}”`;
    $('#resultsSub').textContent = 'Searching cities, towns and villages worldwide…';
    $('#miniSearchText').textContent = q;
    state.lastLoad = () => runSearch(q);
    const seq = ++searchSeq;
    setStatus('loading');
    try {
      const d = await getJSON(`${GEO}/search?name=${encodeURIComponent(q)}&count=40&language=en&format=json`);
      if (seq !== searchSeq) return;
      const list = (d.results || []).map(norm);
      if (!list.length) { state.items = []; setStatus('none'); return; }
      finishLoad(seq, list);
    } catch (e) { if (seq === searchSeq) setStatus('error', e); }
  }
  function finishLoad(seq, list) {
    if (seq !== searchSeq) return;
    state.items = remember(list);
    setStatus('ready');
    loadWeather(list);
    enrichImages(list);
  }
  function loadSession(k) { try { return JSON.parse(memSession.getItem('s:'+k)); } catch { return null; } }
  function saveSession(k, v) { try { memSession.setItem('s:'+k, JSON.stringify(v)); } catch { /* ignore */ } }

  function setStatus(s, err) {
    state.status = s;
    const grid = $('#grid');
    grid.setAttribute('aria-busy', s === 'loading');
    $('#stateError').hidden = s !== 'error';
    $('#stateNone').hidden = s !== 'none';
    $('#stateEmpty').hidden = true;
    $('#activeFilters').hidden = !(s === 'ready' || s === 'loading');
    $('#toolbar').style.visibility = (s === 'ready' || s === 'loading') ? '' : 'hidden';
    if (s === 'loading') {
      grid.hidden = false;
      grid.innerHTML = Array.from({ length: 8 }, () => `<div class="card-skel" aria-hidden="true"><div class="card-media skel"></div><div class="skel skel-line" style="width:70%"></div><div class="skel skel-line" style="width:45%"></div></div>`).join('');
    } else if (s === 'ready') {
      renderGrid();
    } else {
      grid.hidden = true; grid.innerHTML = '';
      if (s === 'error') {
        $('#stateErrorText').textContent = (err instanceof TypeError || !navigator.onLine) ? 'It looks like you are offline. Check your connection and try again.' : 'Something went wrong on their side. Give it another go in a moment.';
        $('#resultsSub').textContent = 'We could not load places right now.';
      }
      if (s === 'none') {
        $('#resultsSub').textContent = 'No matches yet.';
        $('#stateNoneText').textContent = `Nothing called “${state.query}” turned up. Check the spelling, or try one of these:`;
        $('#stateNoneSuggest').innerHTML = TRY_NAMES.map(n => `<button class="pill-btn" type="button" data-try="${esc(n)}">${esc(n)}</button>`).join('');
      }
    }
    icons();
  }

  /* ---------------- filtering / sorting ---------------- */
  function matches(p, f = state.filters) {
    if (f.type === 'capital' && p.fcode !== 'PPLC') return false;
    if (f.type === 'big' && p.pop < 1e6) return false;
    if (f.type === 'mid' && (p.pop < 1e5 || p.pop >= 1e6)) return false;
    if (f.type === 'small' && p.pop >= 1e5) return false;
    if (f.country !== 'all' && p.cc !== f.country) return false;
    if (f.climate !== 'any') {
      const w = wx.get(p.id);
      if (!w) return false;
      if (f.climate === 'warm' && w.t < 22) return false;
      if (f.climate === 'mild' && (w.t < 12 || w.t >= 22)) return false;
      if (f.climate === 'cold' && w.t >= 12) return false;
      if (f.climate === 'dry' && w.code >= 51) return false;
    }
    return true;
  }
  function visible() {
    const list = state.items.filter(p => matches(p));
    const t = id => wx.get(id)?.t;
    switch (state.sort) {
      case 'pop-desc': list.sort((a, b) => b.pop - a.pop); break;
      case 'pop-asc': list.sort((a, b) => (a.pop || Infinity) - (b.pop || Infinity)); break;
      case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'warm': list.sort((a, b) => (t(b.id) ?? -99) - (t(a.id) ?? -99)); break;
      case 'cool': list.sort((a, b) => (t(a.id) ?? 99) - (t(b.id) ?? 99)); break;
    }
    return list;
  }

  /* ---------------- render: grid ---------------- */
  function cardHTML(p, i) {
    const saved = inTrip(p.id);
    const tag = p.fcode === 'PPLC' ? 'Capital' : (p.pop >= 5e6 ? 'Megacity' : '');
    const lt = localTime(p.tz);
    return `<article class="card" style="--i:${Math.min(i, 12)}" data-id="${esc(p.id)}" tabindex="0" aria-label="${esc(p.name)}, ${esc(p.country)}. Open details">
      <div class="card-media" data-media="${esc(p.id)}">
        ${mediaHTML(p)}
        ${tag ? `<span class="card-tag">${tag}</span>` : ''}
        <button class="heart ${saved ? 'on' : ''}" type="button" data-heart="${esc(p.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Save'} ${esc(p.name)} ${saved ? 'from' : 'to'} my trip"><i data-lucide="heart"></i></button>
      </div>
      <div class="card-body">
        <div class="card-row"><span class="card-name">${esc(p.name)}</span><span class="card-temp" data-temp="${esc(p.id)}">${tempHTML(p.id)}</span></div>
        <span class="card-loc">${esc(placeLine(p))}</span>
        <span class="card-meta">${p.pop ? `<b>${compact(p.pop)}</b> people` : esc(kind(p))}${lt ? ` · ${lt} local time` : ''}</span>
      </div>
    </article>`;
  }
  function renderGrid() {
    if (state.status !== 'ready') return;
    const list = visible();
    const grid = $('#grid');
    grid.hidden = list.length === 0;
    grid.innerHTML = list.map(cardHTML).join('');
    $('#stateEmpty').hidden = list.length !== 0;
    const n = state.items.length;
    if (state.mode === 'search') {
      $('#resultsSub').textContent = list.length === n ? `${n} ${n === 1 ? 'place' : 'places'} found around the world` : `Showing ${list.length} of ${n} places`;
    } else if (list.length !== n) {
      $('#resultsSub').textContent = `Showing ${list.length} of ${n} places`;
    } else {
      $('#resultsSub').textContent = CATS.find(c => c.id === state.cat).sub;
    }
    if (!list.length) {
      const pending = state.filters.climate !== 'any' && state.items.some(p => !wx.has(p.id));
      $('#stateEmptyText').textContent = pending ? 'Still checking the weather in these places. Hang on a second.' : 'None of these places fit every filter. Loosen one and try again.';
    }
    renderActiveFilters();
    icons();
  }
  function renderCats() {
    $('#cats').innerHTML = CATS.map(c => `<button class="cat" role="tab" type="button" data-cat="${c.id}" style="--c:${c.color}" aria-selected="${state.mode === 'cat' && state.cat === c.id}">
      <span class="cat-ico"><i data-lucide="${c.icon}"></i></span>${esc(c.label)}</button>`).join('');
    icons();
  }
  const TYPE_LABEL = { capital: 'National capitals', big: '1M+ people', mid: '100k–1M people', small: 'Under 100k people' };
  const CLIMATE_LABEL = { warm: 'Warm, 22°+', mild: 'Mild, 12–22°', cold: 'Cold, under 12°', dry: 'Dry skies' };
  function countryName(cc) { const p = state.items.find(x => x.cc === cc); return p ? p.country : cc; }
  function renderActiveFilters() {
    const f = state.filters, chips = [];
    if (f.type !== 'all') chips.push(['type', TYPE_LABEL[f.type]]);
    if (f.climate !== 'any') chips.push(['climate', CLIMATE_LABEL[f.climate]]);
    if (f.country !== 'all') chips.push(['country', countryName(f.country)]);
    $('#activeFilters').innerHTML = chips.map(([k, l]) => `<span class="af-chip">${esc(l)}<button type="button" data-unfilter="${k}" aria-label="Remove filter ${esc(l)}"><i data-lucide="x"></i></button></span>`).join('');
    const fc = $('#filterCount');
    fc.hidden = !chips.length; fc.textContent = chips.length;
    $('#searchType').value = f.type;
  }

  /* ---------------- filters dialog ---------------- */
  const fDlg = $('#filters');
  let draft = null;
  function openFilters() {
    draft = { ...state.filters };
    const counts = {};
    state.items.forEach(p => { if (p.cc) counts[p.cc] = (counts[p.cc] || 0) + 1; });
    const opts = Object.keys(counts).map(cc => [cc, countryName(cc), counts[cc]]).sort((a, b) => a[1].localeCompare(b[1]));
    if (draft.country !== 'all' && !counts[draft.country]) draft.country = 'all';
    $('#fCountry').innerHTML = `<option value="all">All countries (${state.items.length})</option>` + opts.map(([cc, n, c]) => `<option value="${cc}">${esc(n)} (${c})</option>`).join('');
    syncDraft();
    fDlg.showModal();
    document.body.classList.add('locked');
  }
  function syncDraft() {
    $$('input[name="type"]', fDlg).forEach(r => { r.checked = r.value === draft.type; });
    $$('input[name="climate"]', fDlg).forEach(r => { r.checked = r.value === draft.climate; });
    $('#fCountry').value = draft.country;
    const n = state.items.filter(p => matches(p, draft)).length;
    $('#fApply').textContent = n ? `Show ${n} ${n === 1 ? 'place' : 'places'}` : 'No matches';
    $('#fApply').disabled = n === 0;
  }
  fDlg.addEventListener('change', e => {
    if (e.target.name === 'type') draft.type = e.target.value;
    if (e.target.name === 'climate') draft.climate = e.target.value;
    if (e.target.id === 'fCountry') draft.country = e.target.value;
    syncDraft();
  });
  $('#fReset').addEventListener('click', () => { draft = { type: 'all', climate: 'any', country: 'all' }; syncDraft(); });
  $('#fApply').addEventListener('click', () => { state.filters = { ...draft }; fDlg.close(); renderGrid(); });
  fDlg.addEventListener('close', () => document.body.classList.remove('locked'));
  fDlg.addEventListener('click', e => { if (e.target === fDlg) fDlg.close(); });
  $('#openFilters').addEventListener('click', openFilters);

  /* ---------------- autocomplete ---------------- */
  const input = $('#searchInput'), sug = $('#suggestList');
  let sugItems = [], sugIdx = -1, sugCtrl;
  const fetchSuggest = debounce(async q => {
    if (q.length < 2 || document.activeElement !== input) return closeSuggest();
    sugCtrl?.abort(); sugCtrl = new AbortController();
    try {
      const d = await getJSON(`${GEO}/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`, sugCtrl.signal);
      if (input.value.trim() !== q || document.activeElement !== input) return;
      sugItems = remember((d.results || []).map(norm));
      sugIdx = -1;
      sug.innerHTML = sugItems.length
        ? sugItems.map((p, i) => `<li role="option" id="sug-${i}" data-sug="${i}" aria-selected="false"><span class="s-ico"><i data-lucide="${p.fcode === 'PPLC' ? 'landmark' : 'map-pin'}"></i></span><span><span class="s-name">${esc(p.name)}</span><br><span class="s-sub">${esc(placeLine(p))}${p.pop ? ` · ${compact(p.pop)} people` : ''}</span></span>${p.cc ? `<img class="s-flag" src="${flag(p.cc)}" alt="" loading="lazy">` : ''}</li>`).join('')
          + `<li class="s-sub" data-sug="all" style="justify-content:center;font-weight:700;color:var(--ink)">See all results for “${esc(q)}”</li>`
        : `<li class="s-empty">No places match “${esc(q)}” yet</li>`;
      sug.hidden = false; input.setAttribute('aria-expanded', 'true');
      icons();
    } catch (e) { if (e.name !== 'AbortError') closeSuggest(); }
  }, 220);
  function closeSuggest() { sug.hidden = true; input.setAttribute('aria-expanded', 'false'); sugIdx = -1; }
  function highlight(i) {
    const lis = $$('li[data-sug]', sug);
    if (!lis.length) return;
    sugIdx = (i + lis.length) % lis.length;
    lis.forEach((li, j) => li.setAttribute('aria-selected', j === sugIdx));
    input.setAttribute('aria-activedescendant', lis[sugIdx].id || '');
  }
  input.addEventListener('input', () => fetchSuggest(input.value.trim()));
  input.addEventListener('keydown', e => {
    if (sug.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(sugIdx + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(sugIdx - 1); }
    else if (e.key === 'Escape') closeSuggest();
    else if (e.key === 'Enter' && sugIdx >= 0) {
      e.preventDefault();
      $$('li[data-sug]', sug)[sugIdx]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    }
  });
  sug.addEventListener('mousedown', e => {
    const li = e.target.closest('[data-sug]'); if (!li) return;
    e.preventDefault();
    closeSuggest();
    if (li.dataset.sug === 'all') return submitSearch();
    const p = sugItems[+li.dataset.sug];
    if (p) { enrichImages([p]); openPlace(p); }
  });
  input.addEventListener('blur', () => setTimeout(closeSuggest, 120));

  function submitSearch() {
    sugCtrl?.abort(); input.blur(); closeSuggest();
    state.filters.type = $('#searchType').value;
    if (state.view !== 'explore') location.hash = '#/';
    runSearch(input.value);
    setTimeout(() => $('#resultsSection').scrollIntoView({ behavior: 'smooth' }), 60);
  }
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); submitSearch(); });
  $('#searchType').addEventListener('change', e => { state.filters.type = e.target.value; renderGrid(); });

  /* ---------------- detail sheet ---------------- */
  const dlg = $('#detail');
  let dMap, dMarker, detailSeq = 0;
  function openPlace(p, push = true) {
    current = p; known.set(p.id, p);
    if (push && location.hash !== `#/place/${p.id}`) { pushedPlace = true; location.hash = `#/place/${p.id}`; return; }
    renderDetail(p);
    if (!dlg.open) { dlg.showModal(); document.body.classList.add('locked'); }
    $('#detailScroll').scrollTop = 0;
  }
  function closePlace() {
    if (!dlg.open) return;
    dlg.close();
  }
  dlg.addEventListener('close', () => {
    document.body.classList.remove('locked');
    if (location.hash.startsWith('#/place/')) {
      if (pushedPlace) { pushedPlace = false; history.back(); }
      else history.replaceState(null, '', state.view === 'trip' ? '#/trip' : '#/');
    }
  });
  dlg.addEventListener('click', e => { if (e.target === dlg) closePlace(); });
  $('#dClose').addEventListener('click', closePlace);
  $('#dShare').addEventListener('click', async () => {
    const url = location.href.split('#')[0] + `#/place/${current.id}`;
    try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone with it can open this place.'); } catch { toast(url); }
  });

  function fact(icon, label, value) { return `<div class="fact"><i data-lucide="${icon}"></i><span><small>${label}</small><b>${value}</b></span></div>`; }
  function renderDetail(p) {
    const seq = ++detailSeq;
    const im = imgs[p.id];
    const hero = $('#dHero');
    hero.style.backgroundImage = im?.s ? `url("${im.s}")` : '';
    hero.style.backgroundColor = im?.s ? '' : fallbackColor(p);
    $('#dCredit').textContent = im?.a ? `Photo: ${im.a}` : '';
    $('#dName').textContent = p.name;
    $('#dLoc').innerHTML = `${p.cc ? `<img src="${flag(p.cc)}" alt="">` : ''}<span>${esc(placeLine(p))}</span>`;
    const lt = localTime(p.tz);
    $('#dChips').innerHTML = [
      fact('building-2', 'Type', kind(p)),
      fact('users', 'Population', p.pop ? new Intl.NumberFormat('en').format(p.pop) : 'Not listed'),
      p.elev != null ? fact('mountain', 'Elevation', `${Math.round(p.elev)} m`) : '',
      lt ? fact('clock', 'Local time', `${lt} <span class="muted" style="font-weight:500">${esc(p.tz.split('/').pop().replace(/_/g, ' '))}</span>`) : '',
      fact('compass', 'Coordinates', `${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}°`),
    ].join('');
    $('#dAbout').innerHTML = `<div class="skel skel-line" style="width:96%"></div><div class="skel skel-line" style="width:90%"></div><div class="skel skel-line" style="width:60%"></div>`;
    $('#dWeather').innerHTML = Array.from({ length: 7 }, () => `<div class="day skel" style="height:118px;border:0"></div>`).join('');
    $('#dNearby').innerHTML = Array.from({ length: 4 }, () => `<div><div class="near-img skel"></div><div class="skel skel-line" style="width:80%"></div></div>`).join('');
    $('#dNow').innerHTML = `<div class="skel" style="width:100%;height:48px"></div>`;
    $('#dGmaps').href = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;
    const stop = trip.stops.find(s => s.id === p.id);
    draftNights = stop ? stop.nights : 2;
    syncAddButton();
    icons();
    setTimeout(() => detailMap(p), 60);
    loadAbout(p, seq);
    loadForecast(p, seq);
    loadNearby(p, seq);
  }
  function syncAddButton() {
    if (!current) return;
    const saved = inTrip(current.id);
    const b = $('#dAdd');
    b.classList.toggle('is-saved', saved);
    b.innerHTML = saved ? `<i data-lucide="check"></i> <span class="hide-sm">In your trip · </span>Remove` : `<i data-lucide="heart"></i> Add to my trip`;
    $('#nVal').textContent = draftNights;
    $('#nMinus').disabled = draftNights <= 1;
    $('#nPlus').disabled = draftNights >= 30;
    $('#dNote').textContent = saved ? `Stop ${trip.stops.findIndex(s => s.id === current.id) + 1} of ${trip.stops.length} in “${trip.name}”` : 'Saved in this browser. No account needed.';
    icons();
  }
  function stepNights(d) {
    draftNights = Math.min(30, Math.max(1, draftNights + d));
    const stop = current && trip.stops.find(s => s.id === current.id);
    if (stop) { stop.nights = draftNights; saveTrip(); if (state.view === 'trip') renderTrip(); }
    syncAddButton();
  }
  $('#nMinus').addEventListener('click', () => stepNights(-1));
  $('#nPlus').addEventListener('click', () => stepNights(1));
  $('#dAdd').addEventListener('click', () => { toggleTrip(current, draftNights); syncAddButton(); });

  function cleanExtract(t) {
    // strip pronunciation/foreign-script parentheticals from the first sentence
    let out = '', depth = 0, i = 0;
    const cut = t.indexOf('. ') > 0 ? t.indexOf('. ') : t.length;
    for (; i < cut; i++) { const c = t[i]; if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1); else if (!depth) out += c; }
    return (out + t.slice(i)).replace(/\s+([,.;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  }
  async function loadAbout(p, seq) {
    try {
      let title = imgs[p.id]?.t;
      if (!title) {
        await enrichImages([p]);
        title = imgs[p.id]?.t;
      }
      if (seq !== detailSeq) return;
      if (!title) throw new Error('no article');
      const d = await getJSON(`${WIKI}?action=query&format=json&origin=*&redirects=1&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=4&piprop=thumbnail|name&pithumbsize=1600&titles=${encodeURIComponent(title)}`);
      if (seq !== detailSeq) return;
      const pg = Object.values(d.query?.pages || {})[0];
      if (isPhoto(pg)) {
        const big = new Image();
        big.onload = () => { if (seq === detailSeq) { $('#dHero').style.backgroundImage = `url("${pg.thumbnail.source}")`; $('#dCredit').textContent = ''; } };
        big.src = pg.thumbnail.source;
      } else if (imgs[p.id]?.s) {
        $('#dHero').style.backgroundImage = `url("${imgs[p.id].s}")`;
      }
      const txt = pg?.extract ? cleanExtract(pg.extract) : '';
      if (!txt) throw new Error('no extract');
      $('#dAbout').innerHTML = `<p>${esc(txt)}</p><a href="https://en.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, '_'))}" target="_blank" rel="noopener">Read more on Wikipedia <i data-lucide="arrow-up-right"></i></a>`;
    } catch {
      if (seq !== detailSeq) return;
      if (imgs[p.id]?.s) { $('#dHero').style.backgroundImage = `url("${imgs[p.id].s}")`; $('#dHero').style.backgroundColor = ''; }
      $('#dAbout').innerHTML = `<p>${esc(p.name)} is a ${esc(kind(p).toLowerCase())} in ${esc(placeLine(p) || 'an unlisted region')}. There is no Wikipedia summary for it yet, but the weather, nearby sights and map below still work.</p>`;
    }
    icons();
  }
  async function loadForecast(p, seq) {
    try {
      const d = await getJSON(`${WX}?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto`);
      if (seq !== detailSeq) return;
      const c = d.current, m = wmo(c.weather_code, c.is_day);
      wx.set(p.id, { t: c.temperature_2m, code: c.weather_code, day: c.is_day });
      $('#dNow').innerHTML = `<span class="big-ico"><i data-lucide="${m.icon}"></i></span><span class="big">${Math.round(c.temperature_2m)}°</span><span><b>${m.label} right now</b><small>Feels like ${Math.round(c.apparent_temperature)}° · ${Math.round(c.wind_speed_10m)} km/h wind · ${c.relative_humidity_2m}% humidity</small></span>`;
      const days = d.daily;
      $('#dWeather').innerHTML = days.time.map((t, i) => {
        const wm = wmo(days.weather_code[i]);
        const label = i === 0 ? 'Today' : new Date(t + 'T12:00').toLocaleDateString('en', { weekday: 'short' });
        const rain = days.precipitation_probability_max?.[i];
        return `<div class="day" title="${wm.label}"><span class="dname">${label}</span><i data-lucide="${wm.icon}"></i><span class="hi">${Math.round(days.temperature_2m_max[i])}°</span><span class="lo">${Math.round(days.temperature_2m_min[i])}°</span>${rain != null ? `<span class="lo" style="font-size:12px">${rain}% rain</span>` : ''}</div>`;
      }).join('');
    } catch {
      if (seq !== detailSeq) return;
      $('#dWeather').innerHTML = `<p class="muted-line">The forecast didn't load. Close and reopen this place to try again.</p>`;
      $('#dNow').innerHTML = `<span><b>${esc(p.name)}</b><small>${esc(placeLine(p))}</small></span>`;
    }
    icons();
  }
  async function loadNearby(p, seq) {
    try {
      const d = await getJSON(`${WIKI}?action=query&format=json&origin=*&generator=geosearch&ggscoord=${p.lat}|${p.lon}&ggsradius=10000&ggslimit=30&prop=pageimages|description|coordinates&piprop=thumbnail|name&pithumbsize=400`);
      if (seq !== detailSeq) return;
      const own = imgs[p.id]?.t;
      const list = Object.values(d.query?.pages || {})
        .filter(x => isPhoto(x) && x.title !== own && !/^(List of|Template:)/.test(x.title) && !/(incident|battle|rebellion|massacre|election|earthquake|riot|siege|treaty|attack)/i.test((x.description || '') + ' ' + x.title))
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).slice(0, 10);
      if (!list.length) { $('#dNearby').innerHTML = `<p class="muted-line">No photographed sights within 10 km. Somewhere off the beaten track, then.</p>`; return; }
      $('#dNearby').innerHTML = list.map(x => {
        const c = x.coordinates?.[0];
        const dist = c ? km({ lat: c.lat, lon: c.lon }, p) : null;
        return `<a class="near" href="https://en.wikipedia.org/?curid=${x.pageid}" target="_blank" rel="noopener"><div class="near-img"><img src="${esc(x.thumbnail.source)}" alt="" loading="lazy"></div><b>${esc(x.title)}</b><span>${esc(x.description ? x.description.charAt(0).toUpperCase() + x.description.slice(1) : 'Nearby')}${dist != null ? ` · ${dist < 1 ? '<1' : dist.toFixed(1)} km` : ''}</span></a>`;
      }).join('');
    } catch {
      if (seq !== detailSeq) return;
      $('#dNearby').innerHTML = `<p class="muted-line">Nearby sights couldn't load right now.</p>`;
    }
  }
  function detailMap(p) {
    if (!window.L) { $('#dMap').innerHTML = '<p class="muted-line" style="padding:20px">Map unavailable offline.</p>'; return; }
    if (!dMap) {
      dMap = L.map('dMap', { scrollWheelZoom: false, zoomControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(dMap);
    }
    dMap.invalidateSize();
    dMap.setView([p.lat, p.lon], 10);
    if (dMarker) dMarker.remove();
    dMarker = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: '<div class="map-pin">✳</div>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(dMap);
  }

  /* ---------------- trip ---------------- */
  function toggleTrip(p, nights = 2) {
    if (!p) return;
    const i = trip.stops.findIndex(s => s.id === p.id);
    if (i >= 0) {
      const [removed] = trip.stops.splice(i, 1);
      saveTrip();
      toast(`${p.name} removed from your trip`, 'Undo', () => { trip.stops.splice(i, 0, removed); saveTrip(); refreshAll(); });
    } else {
      trip.stops.push({ ...p, img: imgs[p.id]?.s || '', nights, note: '' });
      saveTrip();
      toast(`${p.name} saved to “${trip.name}”`, 'View trip', () => { if (dlg.open) dlg.close(); setTimeout(() => { location.hash = '#/trip'; }, 50); });
    }
    refreshAll();
  }
  function refreshAll() {
    $$('[data-heart]').forEach(h => {
      const on = inTrip(h.dataset.heart);
      h.classList.toggle('on', on); h.setAttribute('aria-pressed', on);
    });
    if (state.view === 'trip') renderTrip();
    if (dlg.open) syncAddButton();
  }
  function updateCounts() {
    $$('[data-trip-count]').forEach(b => {
      const changed = b.textContent !== String(trip.stops.length);
      b.textContent = trip.stops.length;
      b.classList.toggle('zero', !trip.stops.length);
      if (changed) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    });
  }
  const fmtDate = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  function addDays(iso, n) { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return d; }

  let tMap, tLayer;
  function renderTrip() {
    $('#tripName').value = trip.name;
    $('#tripStart').value = trip.start || '';
    const stops = trip.stops, has = stops.length > 0;
    $('#tripEmpty').hidden = has;
    $('#tripBody').hidden = !has;
    $('#tripStats').hidden = !has;
    $('#copyTrip').disabled = !has; $('#clearTrip').disabled = !has;
    if (!has) { icons(); return; }

    const nights = stops.reduce((a, s) => a + s.nights, 0);
    const countries = new Set(stops.map(s => s.cc || s.country)).size;
    let dist = 0; for (let i = 1; i < stops.length; i++) dist += km(stops[i - 1], stops[i]);
    const end = trip.start ? addDays(trip.start, nights) : null;
    $('#tripStats').innerHTML = `
      <div class="stat"><b>${stops.length}</b><span>${stops.length === 1 ? 'stop' : 'stops'}</span></div>
      <div class="stat"><b>${nights}</b><span>nights · ${nights + 1} days</span></div>
      <div class="stat"><b>${countries}</b><span>${countries === 1 ? 'country' : 'countries'}</span></div>
      <div class="stat hl"><b>${dist < 10 ? Math.round(dist) : new Intl.NumberFormat('en').format(Math.round(dist / 10) * 10)} km</b><span>${stops.length < 2 ? 'add a 2nd stop for a route' : end ? `straight-line, home ${fmtDate(end)}` : 'straight-line route'}</span></div>`;

    let acc = 0;
    $('#stops').innerHTML = stops.map((s, i) => {
      const from = trip.start ? addDays(trip.start, acc) : null; acc += s.nights;
      const to = trip.start ? addDays(trip.start, acc) : null;
      const next = stops[i + 1];
      const leg = next ? Math.round(km(s, next)) : null;
      const pic = imgs[s.id]?.s || s.img;
      return `<li class="stop" data-stop="${esc(s.id)}">
        <span class="stop-num">${i + 1}</span>
        <div class="stop-media" data-media="${esc(s.id)}" data-open="${esc(s.id)}">${pic ? `<img src="${esc(pic)}" alt="${esc(s.name)}" loading="lazy">` : mediaHTML(s)}</div>
        <div class="stop-info">
          <div class="stop-head">
            <div>
              ${from ? `<div class="stop-dates">${fmtDate(from)} → ${fmtDate(to)}</div>` : ''}
              <h3 class="stop-name"><button type="button" data-open="${esc(s.id)}">${esc(s.name)}</button></h3>
              <div class="stop-loc">${s.cc ? `<img src="${flag(s.cc)}" alt="">` : ''}${esc(placeLine(s))}</div>
            </div>
            <div class="stop-tools">
              <button class="icon-btn" type="button" data-move="-1" data-id="${esc(s.id)}" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(s.name)} earlier"><i data-lucide="arrow-up"></i></button>
              <button class="icon-btn" type="button" data-move="1" data-id="${esc(s.id)}" ${i === stops.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(s.name)} later"><i data-lucide="arrow-down"></i></button>
              <button class="icon-btn rm" type="button" data-remove="${esc(s.id)}" aria-label="Remove ${esc(s.name)}"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="stop-ctrls">
            <span class="lbl">Nights</span>
            <div class="stepper">
              <button type="button" data-n="-1" data-id="${esc(s.id)}" ${s.nights <= 1 ? 'disabled' : ''} aria-label="One night fewer in ${esc(s.name)}"><i data-lucide="minus"></i></button>
              <output>${s.nights}</output>
              <button type="button" data-n="1" data-id="${esc(s.id)}" ${s.nights >= 30 ? 'disabled' : ''} aria-label="One night more in ${esc(s.name)}"><i data-lucide="plus"></i></button>
            </div>
          </div>
          <textarea class="stop-note" rows="1" data-note="${esc(s.id)}" placeholder="Add a note: hotel, a café to try, train times…" aria-label="Note for ${esc(s.name)}">${esc(s.note || '')}</textarea>
          ${leg != null ? `<span class="leg"><i data-lucide="move-right"></i>${new Intl.NumberFormat('en').format(leg)} km to ${esc(next.name)}</span>` : ''}
        </div>
      </li>`;
    }).join('');
    icons();
    enrichImages(stops.filter(s => !s.img));
    requestAnimationFrame(tripMapRender);
  }
  function tripMapRender() {
    if (!window.L || state.view !== 'trip' || !trip.stops.length) return;
    if (!tMap) {
      tMap = L.map('tripMap', { scrollWheelZoom: false });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(tMap);
      tLayer = L.layerGroup().addTo(tMap);
    }
    tMap.invalidateSize();
    tLayer.clearLayers();
    const pts = trip.stops.map(s => [s.lat, s.lon]);
    if (pts.length > 1) L.polyline(pts, { color: '#e14b26', weight: 3, dashArray: '6 8', opacity: .9 }).addTo(tLayer);
    trip.stops.forEach((s, i) => {
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html: `<div class="map-pin">${i + 1}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] }) })
        .bindTooltip(`${i + 1}. ${s.name}`, { direction: 'top', offset: [0, -14] }).addTo(tLayer);
    });
    if (pts.length === 1) tMap.setView(pts[0], 8);
    else tMap.fitBounds(pts, { padding: [40, 40], maxZoom: 9 });
  }
  $('#stops').addEventListener('click', e => {
    const mv = e.target.closest('[data-move]');
    if (mv) {
      const i = trip.stops.findIndex(s => s.id === mv.dataset.id), j = i + +mv.dataset.move;
      if (j < 0 || j >= trip.stops.length) return;
      [trip.stops[i], trip.stops[j]] = [trip.stops[j], trip.stops[i]];
      saveTrip(); renderTrip();
      $(`[data-stop="${CSS.escape(mv.dataset.id)}"] [data-move="${mv.dataset.move}"]`)?.focus();
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const li = rm.closest('.stop');
      li.classList.add('leaving');
      setTimeout(() => toggleTrip(trip.stops.find(s => s.id === rm.dataset.remove)), 260);
      return;
    }
    const n = e.target.closest('[data-n]');
    if (n) {
      const s = trip.stops.find(x => x.id === n.dataset.id);
      s.nights = Math.min(30, Math.max(1, s.nights + +n.dataset.n));
      saveTrip(); renderTrip();
      $(`[data-stop="${CSS.escape(s.id)}"] [data-n="${n.dataset.n}"]`)?.focus();
      return;
    }
    const op = e.target.closest('[data-open]');
    if (op) { const s = trip.stops.find(x => x.id === op.dataset.open); if (s) openPlace(s); }
  });
  $('#stops').addEventListener('input', debounce(e => {
    const t = e.target.closest('[data-note]'); if (!t) return;
    const s = trip.stops.find(x => x.id === t.dataset.note); if (s) { s.note = t.value; saveTrip(); }
  }, 300));
  $('#tripName').addEventListener('input', debounce(e => { trip.name = e.target.value.trim() || 'My next trip'; saveTrip(); }, 250));
  $('#tripStart').addEventListener('change', e => { trip.start = e.target.value; saveTrip(); renderTrip(); });
  $('#clearTrip').addEventListener('click', () => {
    const backup = trip.stops.slice();
    trip.stops = []; saveTrip(); renderTrip(); refreshAll();
    toast(`Cleared ${backup.length} ${backup.length === 1 ? 'stop' : 'stops'}`, 'Undo', () => { trip.stops = backup; saveTrip(); renderTrip(); refreshAll(); });
  });
  $('#copyTrip').addEventListener('click', async () => {
    let acc = 0;
    const lines = [trip.name, ''];
    trip.stops.forEach((s, i) => {
      const d = trip.start ? `${fmtDate(addDays(trip.start, acc))}–${fmtDate(addDays(trip.start, acc + s.nights))}: ` : '';
      acc += s.nights;
      lines.push(`${i + 1}. ${d}${s.name}, ${s.country} (${s.nights} ${s.nights === 1 ? 'night' : 'nights'})${s.note ? ` — ${s.note}` : ''}`);
    });
    lines.push('', `Planned with TripWise`);
    try { await navigator.clipboard.writeText(lines.join('\n')); toast('Plan copied. Paste it anywhere.'); }
    catch { toast('Copy is blocked in this browser.'); }
  });

  /* ---------------- toast ---------------- */
  let toastT;
  function toast(msg, action, fn) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
    if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); fn(); };
    t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2600);
  }

  /* ---------------- collections ---------------- */
  async function renderBento() {
    $('#bento').innerHTML = TILES.map(t => {
      const c = CATS.find(x => x.id === t.cat);
      return `<button class="tile" type="button" data-tile="${t.cat}" style="--c:${c.color}"><img alt="" data-wiki="${esc(t.wiki)}"><span class="tile-text"><span class="tile-label">${esc(c.label)}</span><span class="tile-title">${esc(c.title)}</span><span class="tile-sub">${esc(t.sub)}</span></span></button>`;
    }).join('');
    try {
      const pages = await wikiPages(TILES.map(t => t.wiki), 1200);
      $$('#bento img[data-wiki]').forEach(img => {
        const pg = pages[img.dataset.wiki];
        if (pg?.thumbnail) { img.onload = () => img.classList.add('loaded'); img.src = pg.thumbnail.source; img.alt = pg.title; }
      });
    } catch { /* tiles keep their colour */ }
  }

  /* ---------------- routing ---------------- */
  async function route() {
    const h = location.hash || '#/';
    const m = h.match(/^#\/place\/(\d+)/);
    if (m) {
      const id = m[1];
      let p = known.get(id) || trip.stops.find(s => s.id === id);
      if (!p) {
        try { const d = await getJSON(`${GEO}/get?id=${id}`); p = norm(d); known.set(p.id, p); }
        catch { toast('That place link no longer works.'); history.replaceState(null, '', '#/'); return route(); }
      }
      if (state.status === 'idle') showView('explore');
      openPlace(p, false);
      return;
    }
    if (dlg.open) { pushedPlace = false; dlg.close(); }
    showView(h.startsWith('#/trip') ? 'trip' : 'explore');
  }
  function showView(v) {
    const changed = state.view !== v;
    state.view = v;
    $('#exploreView').hidden = v !== 'explore';
    $('#tripView').hidden = v !== 'trip';
    $$('[data-route]').forEach(a => { a.classList.toggle('active', a.dataset.route === v); a.toggleAttribute('aria-current', a.dataset.route === v); });
    document.title = v === 'trip' ? `${trip.name} · TripWise` : 'TripWise · Find a place, plan the days';
    if (v === 'trip') renderTrip();
    if (v === 'explore' && state.status === 'idle') loadCategory('trending');
    if (changed) window.scrollTo({ top: 0 });
    onScroll();
  }

  /* ---------------- global events ---------------- */
  $('#cats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    input.value = '';
    loadCategory(b.dataset.cat);
    const top = $('#resultsSection').getBoundingClientRect().top + scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) + 90);
    if (scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  });
  $('#bento').addEventListener('click', e => {
    const t = e.target.closest('[data-tile]'); if (!t) return;
    input.value = '';
    loadCategory(t.dataset.tile);
    $('#catsBar').scrollIntoView({ behavior: 'smooth' });
  });
  $('#grid').addEventListener('click', e => {
    const h = e.target.closest('[data-heart]');
    if (h) {
      e.stopPropagation();
      const p = known.get(h.dataset.heart);
      toggleTrip(p);
      h.classList.remove('pop'); void h.offsetWidth; h.classList.add('pop');
      return;
    }
    const c = e.target.closest('.card');
    if (c) openPlace(known.get(c.dataset.id));
  });
  $('#grid').addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) { e.preventDefault(); openPlace(known.get(e.target.dataset.id)); }
  });
  $('#sortSelect').addEventListener('change', e => { state.sort = e.target.value; renderGrid(); });
  $('#activeFilters').addEventListener('click', e => {
    const b = e.target.closest('[data-unfilter]'); if (!b) return;
    state.filters[b.dataset.unfilter] = ({ type: 'all', climate: 'any', country: 'all' })[b.dataset.unfilter];
    renderGrid();
  });
  $('#clearFiltersBtn').addEventListener('click', () => { state.filters = { type: 'all', climate: 'any', country: 'all' }; renderGrid(); });
  $('#retryBtn').addEventListener('click', () => state.lastLoad && state.lastLoad());
  $('#stateNoneSuggest').addEventListener('click', e => { const b = e.target.closest('[data-try]'); if (b) { input.value = b.dataset.try; runSearch(b.dataset.try); } });
  $('#miniSearch').addEventListener('click', () => {
    if (state.view !== 'explore') location.hash = '#/';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => input.focus({ preventScroll: true }), 350);
  });
  window.addEventListener('hashchange', route);

  const header = $('#siteHeader'), catsBar = $('#catsBar');
  function onScroll() {
    header.classList.toggle('scrolled', scrollY > 8);
    const formBottom = $('#searchForm').getBoundingClientRect().bottom;
    header.classList.toggle('show-mini', state.view === 'explore' && formBottom < 70);
    const hh = header.offsetHeight;
    catsBar.classList.toggle('stuck', state.view === 'explore' && catsBar.getBoundingClientRect().top <= hh + 1);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('storage', e => { if (e.key === TRIP_KEY) { trip = loadTrip(); updateCounts(); refreshAll(); } });
  setInterval(() => { // keep local times honest
    if (state.view === 'explore' && state.status === 'ready' && !dlg.open) $$('.card').forEach(c => {
      const p = known.get(c.dataset.id); const m = c.querySelector('.card-meta');
      if (p && m) m.innerHTML = `${p.pop ? `<b>${compact(p.pop)}</b> people` : esc(kind(p))}${localTime(p.tz) ? ` · ${localTime(p.tz)} local time` : ''}`;
    });
  }, 60000);

  /* ---------------- boot ---------------- */
  renderCats();
  renderBento();
  updateCounts();
  if (!(location.hash || '').startsWith('#/place/') && !(location.hash || '').startsWith('#/trip')) loadCategory('trending');
  route();
  icons();
})();
