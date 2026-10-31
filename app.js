
/* Embedded application code from app.js */

(function () {
  
const geojson = window.RDU_GEOJSON;
  const summary = window.RDU_SUMMARY;
  const chapters = window.RDU_CHAPTERS;
  const UI = window.RDU_UI;
  const LANGS = ['en', 'it', 'uk', 'ru'];
  const query = new URLSearchParams(location.search);
  let savedLanguage;
  try { savedLanguage = localStorage.getItem('rdu-language'); } catch (_) {}
  const initialLanguage = query.get('lang') || savedLanguage || 'en';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    language: LANGS.includes(initialLanguage) ? initialLanguage : 'en',
    activeYear: 'all',
    archiveVisible: true,
    search: '',
    enabledLayers: new Set(summary.layers.map(l => l.name_en || l.name)),
    activeChapter: null,
    markers: [],
    featureById: new Map(),
    timelineEvents: [],
    timelineIndex: null,
    playTimer: null,
    selectedFeature: null,
    selectedTimelineEvent: null,
    searchIndex: new Map(),
    firstDates: new Map(),
    visibleMarkers: new Set(),
    highlightedMarker: null,
  };

  const el = {
    statsGrid: document.getElementById('statsGrid'),
    layerFilters: document.getElementById('layerFilters'),
    yearFilters: document.getElementById('yearFilters'),
    chapterList: document.getElementById('chapterList'),
    searchInput: document.getElementById('searchInput'),
    visibleCount: document.getElementById('visibleCount'),
    activeFilterText: document.getElementById('activeFilterText'),
    languageSelect: document.getElementById('languageSelect'),
    resetFilters: document.getElementById('resetFilters'),
    pinPanel: document.getElementById('pinPanel'),
    togglePanel: document.getElementById('togglePanel'),
    storyPanel: document.getElementById('storyPanel'),
    storyContent: document.getElementById('storyContent'),
    sheetToggle: document.getElementById('sheetToggle'),
    sheetMeta: document.getElementById('sheetMeta'),
    quickBasemap: document.getElementById('quickBasemap'),
    quickZoomIn: document.getElementById('quickZoomIn'),
    quickZoomOut: document.getElementById('quickZoomOut'),
    quickLayers: document.getElementById('quickLayers'),
    quickPrevious: document.getElementById('quickPrevious'),
    quickPlay: document.getElementById('quickPlay'),
    quickNext: document.getElementById('quickNext'),
    quickReset: document.getElementById('quickReset'),
    closeStory: document.getElementById('closeStory'),
    storyBackdrop: document.getElementById('storyBackdrop'),
    timelineRange: document.getElementById('timelineRange'),
    timelineStatus: document.getElementById('timelineStatus'),
    prevTimeline: document.getElementById('prevTimeline'),
    nextTimeline: document.getElementById('nextTimeline'),
    playTimeline: document.getElementById('playTimeline'),
    clearTimeline: document.getElementById('clearTimeline'),
    openSatellites: document.getElementById('openSatellites'),
    openGeoFact: document.getElementById('openGeoFact'),
    topSatellites: document.getElementById('topSatellitesLink'),
    topGeoFact: document.getElementById('topGeoFactLink'),
  };

  function tr(key) { return (UI[state.language] && UI[state.language][key]) || (UI.en && UI.en[key]) || key; }
  const numberFormats = Object.fromEntries(LANGS.map(lang => [lang, new Intl.NumberFormat(lang)]));
  function number(n) { return numberFormats[state.language].format(n || 0); }
  function escapeHtml(str) { return String(str || '').replace(/[&<>'"]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[s])); }
  function byLang(obj, base, fallback='') { return obj[`${base}_${state.language}`] || obj[`${base}_en`] || obj[`${base}_it`] || obj[`${base}_original`] || obj[base] || fallback; }
  function layerNameFromSummary(layer) { return byLang(layer, 'name', layer.name || ''); }
  function layerBlurbFromSummary(layer) { return byLang(layer, 'blurb', layer.blurb || ''); }
  function titleFor(feature) { return byLang(feature.properties, 'title', feature.properties.title_original || ''); }
  function layerFor(feature) { return byLang(feature.properties, 'layer', feature.properties.layer_en || ''); }
  function descriptionFor(feature) { return byLang(feature.properties, 'description', feature.properties.description_original || ''); }
  function chapterField(chapter, field) { return chapter[`${field}_${state.language}`] || chapter[`${field}_en`] || chapter[field] || ''; }
  function firstDate(feature) { return state.firstDates.get(feature.properties.id); }
  function eventLabel(event) { return `${event.dateRaw || event.date} · ${titleFor(event.feature)}`; }

  const layerColors = new Map();
  geojson.features.forEach(f => {
    const key = f.properties.layer_en;
    if (!layerColors.has(key)) layerColors.set(key, f.properties.style_color || '#005bbb');
    state.featureById.set(f.properties.id, f);
    const p = f.properties;
    state.searchIndex.set(p.id, [p.title_original, p.title_it, p.title_en, p.title_uk, p.title_ru,
      p.layer_it, p.layer_en, p.layer_uk, p.layer_ru, p.description_original, p.description_it,
      p.description_en, p.description_uk, p.description_ru, ...(p.source_links || []),
      ...f.geometry.coordinates, f.geometry.coordinates.slice().reverse().join(', ')]
      .join(' ').toLocaleLowerCase());
    state.firstDates.set(p.id, (p.dates || []).find(d => d.normalized_start)?.normalized_start || null);
  });
  const chapterById = new Map(chapters.map(chapter => [chapter.id, chapter]));

  function buildTimelineEvents() {
    const events = [];
    geojson.features.forEach(f => {
      const dates = (f.properties.dates || []).filter(d => d.normalized_start);
      dates.forEach(d => events.push({ date: d.normalized_start, end: d.normalized_end || d.normalized_start, dateRaw: d.raw, feature: f }));
    });
    events.sort((a, b) => a.date.localeCompare(b.date) || (a.feature.properties.layer_en || '').localeCompare(b.feature.properties.layer_en || ''));
    state.timelineEvents = events;
    el.timelineRange.max = Math.max(0, events.length - 1);
    el.timelineRange.value = 0;
  }

  const map = L.map('map', { zoomControl: false }).setView([47.0974704, 37.5271214], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    attribution: 'Imagery &copy; Esri | Original map: Alex S (@4LEX5) | Tochnyi rebuild'
  }).addTo(map);
  const esriLabels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 20,
    attribution: 'Labels &copy; Esri'
  });
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors | Original map: Alex S (@4LEX5) | Tochnyi rebuild'
  });
  const hot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors, Humanitarian OpenStreetMap Team'
  });
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: '&copy; OpenStreetMap contributors, SRTM | OpenTopoMap'
  });
  const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  });
  const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  });
  let basemapControl;
  const basemaps = [
    ['basemapSatellite', esriSat], ['basemapStreet', osm],
    ['basemapHumanitarian', hot], ['basemapTerrain', topo],
    ['basemapLight', cartoLight], ['basemapDark', cartoDark],
  ];
  function updateBasemapLabel() {
    const toggle = basemapControl?.getContainer().querySelector('.leaflet-control-layers-toggle');
    const active = basemaps.find(([, layer]) => map.hasLayer(layer));
    if (toggle) {
      toggle.textContent = tr(active ? active[0] : 'mapLayers');
      toggle.title = tr('mapLayers');
      toggle.setAttribute('aria-label', `${tr('mapLayers')}: ${toggle.textContent}`);
    }
    el.quickBasemap.value = active?.[1] === esriSat && map.hasLayer(esriLabels) ? 'satellite-labels' : active?.[0] || 'basemapSatellite';
  }
  function renderBasemapControl() {
    if (basemapControl) map.removeControl(basemapControl);
    basemapControl = L.control.layers({
      [tr('basemapSatellite')]: esriSat,
      [tr('basemapStreet')]: osm,
      [tr('basemapHumanitarian')]: hot,
      [tr('basemapTerrain')]: topo,
      [tr('basemapLight')]: cartoLight,
      [tr('basemapDark')]: cartoDark,
    }, { [tr('satelliteLabels')]: esriLabels }, { position: 'bottomright', collapsed: true }).addTo(map);
    el.quickBasemap.innerHTML = basemaps.map(([key], index) =>
      `<option value="${key}">${escapeHtml(tr(key))}</option>` + (index === 0
        ? `<option value="satellite-labels">${escapeHtml(tr(key) + ' + ' + tr('satelliteLabels'))}</option>` : '')).join('');
    updateBasemapLabel();
  }
  map.on('baselayerchange overlayadd overlayremove', updateBasemapLabel);
  el.quickBasemap.addEventListener('change', () => {
    const selected = el.quickBasemap.value;
    const key = selected === 'satellite-labels' ? 'basemapSatellite' : selected;
    const entry = basemaps.find(([name]) => name === key);
    if (!entry) return;
    basemaps.forEach(([, layer]) => { if (map.hasLayer(layer)) map.removeLayer(layer); });
    if (map.hasLayer(esriLabels)) map.removeLayer(esriLabels);
    entry[1].addTo(map);
    if (selected === 'satellite-labels') esriLabels.addTo(map);
    updateBasemapLabel();
    updateQuickZoom();
  });
  function updateQuickZoom() {
    el.quickZoomIn.disabled = map.getZoom() >= map.getMaxZoom();
    el.quickZoomOut.disabled = map.getZoom() <= map.getMinZoom();
  }
  el.quickZoomIn.addEventListener('click', () => map.zoomIn());
  el.quickZoomOut.addEventListener('click', () => map.zoomOut());
  map.on('zoomend zoomlevelschange', updateQuickZoom);
  updateQuickZoom();

  const cluster = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: true,
    maxClusterRadius: 42, animate: !reducedMotion }).addTo(map);
  const iconCache = new Map();

  function markerIcon(feature, active=false) {
    const color = feature.properties.style_color || '#005bbb';
    const size = active ? 16 : 11;
    const key = `${color}:${size}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const icon = L.divIcon({
      className: 'rdu-marker',
      html: `<span style="width:${size}px;height:${size}px;background:${escapeHtml(color)};border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,.45);display:block;border-radius:999px;"></span>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2]
    });
    iconCache.set(key, icon);
    return icon;
  }

  function popupHtml(feature) {
    const p = feature.properties;
    const dates = (p.dates || []).slice(0, 3).map(d => d.raw).join(' · ') || tr('noDate');
    return `<div class="popup-title">${escapeHtml(titleFor(feature))}</div>
      <div class="popup-meta">${escapeHtml(layerFor(feature))}</div>
      <div class="popup-meta">${escapeHtml(dates)}</div>
      <button class="pill-button" type="button" data-pin="${escapeHtml(p.id)}" style="margin-top:8px;padding:6px 10px;">${escapeHtml(tr('open'))}</button>`;
  }

  function makeMarker(feature) {
    const coords = feature.geometry.coordinates;
    const icon = markerIcon(feature);
    const marker = L.marker([coords[1], coords[0]], { icon });
    marker.rduId = feature.properties.id;
    marker.rduNormalIcon = icon;
    marker.bindPopup(() => popupHtml(feature));
    marker.on('popupopen', () => {
      const btn = document.querySelector(`[data-pin="${CSS.escape(feature.properties.id)}"]`);
      if (btn) btn.addEventListener('click', () => renderPinPanel(feature));
    });
    marker.on('click', () => renderPinPanel(feature));
    return marker;
  }

  function renderStats() {
    const stats = [
      [summary.feature_count, tr('pins')],
      [summary.layer_count, tr('layersStat')],
      [summary.image_count, tr('images')],
      [summary.date_reference_count, tr('dateRefs')],
    ];
    el.statsGrid.innerHTML = stats.map(([value, label]) => `<div class="stat"><strong>${number(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('');
  }

  function renderLayerFilters() {
    el.layerFilters.innerHTML = summary.layers.map(layer => {
      const key = layer.name_en || layer.name;
      const color = layerColors.get(key) || '#005bbb';
      const checked = state.enabledLayers.has(key) ? 'checked' : '';
      return `<label class="layer-item annotated">
        <input type="checkbox" data-layer="${escapeHtml(key)}" ${checked} />
        <span class="layer-text"><span class="layer-name">${escapeHtml(layerNameFromSummary(layer))}</span><span class="layer-count">${number(layer.count)} ${escapeHtml(tr('pins'))}</span><span class="layer-blurb">${escapeHtml(layerBlurbFromSummary(layer))}</span></span>
        <span class="color-dot" style="background:${escapeHtml(color)}"></span>
      </label>`;
    }).join('');
    el.layerFilters.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
      const layer = input.dataset.layer;
      if (input.checked) state.enabledLayers.add(layer); else state.enabledLayers.delete(layer);
      state.activeChapter = null;
      document.querySelectorAll('.chapter-card').forEach(card => card.classList.remove('active'));
      applyFilters();
    }));
  }

  function renderYearFilters() {
    const years = Object.keys(summary.year_counts || {}).sort();
    el.yearFilters.innerHTML = [`<button type="button" data-year="all">${escapeHtml(tr('all'))}</button>`, ...years.map(y => `<button type="button" data-year="${escapeHtml(y)}">${escapeHtml(y)}</button>`)].join('');
    el.yearFilters.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.year === state.activeYear));
    el.yearFilters.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      state.activeYear = btn.dataset.year;
      state.timelineIndex = null;
      stopTimeline();
      el.yearFilters.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
      updateTimelineStatus();
      applyFilters();
    }));
  }

  function renderChapters() {
    el.chapterList.innerHTML = chapters.map(chapter => {
      const years = (chapter.years || []).join(' · ') || tr('all');
      const layerNames = (chapter.layers || []).slice(0, 2).map(name => {
        const layer = summary.layers.find(l => (l.name_en || l.name) === name);
        return layer ? layerNameFromSummary(layer) : name;
      }).join(' · ');
      return `<article class="chapter-card${state.activeChapter === chapter.id ? ' active' : ''}" tabindex="0" role="button" data-chapter="${escapeHtml(chapter.id)}">
        <div class="eyebrow">${escapeHtml(chapterField(chapter, 'eyebrow'))}</div>
        <h2>${escapeHtml(chapterField(chapter, 'title'))}</h2>
        <p>${escapeHtml(chapterField(chapter, 'body'))}</p>
        <div class="chapter-meta"><span class="meta-pill">${escapeHtml(years)}</span>${layerNames ? `<span class="meta-pill">${escapeHtml(layerNames)}</span>` : ''}</div>
      </article>`;
    }).join('');
    el.chapterList.querySelectorAll('.chapter-card').forEach(card => {
      const activate = () => activateChapter(card.dataset.chapter);
      card.addEventListener('click', activate);
      card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activate(); } });
    });
  }

  function buildMarkers() {
    state.markers = geojson.features.map(f => ({ feature: f, marker: makeMarker(f) }));
    applyFilters();
    try { const group = L.featureGroup(state.markers.map(x => x.marker)); map.fitBounds(group.getBounds(), { padding: [30, 30] }); } catch (_) {}
  }

  function featureMatches(feature) {
    const p = feature.properties;
    if (!state.archiveVisible) return false;
    if (!state.enabledLayers.has(p.layer_en)) return false;
    if (state.activeYear !== 'all' && !(p.years || []).map(String).includes(String(state.activeYear))) return false;
    if (state.activeChapter) {
      const chapter = chapterById.get(state.activeChapter);
      if (chapter) {
        if (chapter.layers.length && !chapter.layers.includes(p.layer_en)) return false;
        if (chapter.years.length && !(p.years || []).some(y => chapter.years.includes(y))) return false;
      }
    }
    if (state.timelineIndex !== null) {
      const ev = state.timelineEvents[state.timelineIndex];
      const fd = firstDate(feature);
      if (!fd || !ev || fd > ev.date) return false;
    }
    if (state.search) {
      if (!state.searchIndex.get(p.id).includes(state.search)) return false;
    }
    return true;
  }

  function applyFilters() {
    const started = performance.now();
    const visible = new Set();
    const added = [];
    const removed = [];
    const activeId = state.timelineIndex !== null ? state.timelineEvents[state.timelineIndex]?.feature?.properties?.id : null;
    let highlighted = null;
    state.markers.forEach(({ feature, marker }) => {
      if (feature.properties.id === activeId) highlighted = marker;
      if (featureMatches(feature)) {
        visible.add(marker);
        if (!state.visibleMarkers.has(marker)) added.push(marker);
      } else if (state.visibleMarkers.has(marker)) removed.push(marker);
    });
    if (state.highlightedMarker !== highlighted) {
      if (state.highlightedMarker) state.highlightedMarker.setIcon(state.highlightedMarker.rduNormalIcon);
      if (highlighted) highlighted.setIcon(markerIcon(state.featureById.get(activeId), true));
      state.highlightedMarker = highlighted;
    }
    if (removed.length) cluster.removeLayers(removed);
    if (added.length) cluster.addLayers(added);
    state.visibleMarkers = visible;
    el.visibleCount.textContent = `${number(visible.size)} ${tr('visible')}`;
    el.sheetMeta.textContent = el.visibleCount.textContent;
    const bits = [];
    if (state.timelineIndex !== null) {
      const ev = state.timelineEvents[state.timelineIndex];
      bits.push(`${tr('timelineUpTo')} ${ev.dateRaw || ev.date}`);
    }
    if (state.activeYear !== 'all') bits.push(state.activeYear);
    if (state.activeChapter) bits.push(chapterField(chapters.find(c => c.id === state.activeChapter) || {}, 'title') || 'chapter');
    if (state.search) bits.push(`${tr('search')}: “${el.searchInput.value.trim()}”`);
    el.activeFilterText.textContent = bits.length ? bits.join(' · ') : tr('allLayersYears');
    performance.measure('rdu-filter', { start: started, end: performance.now() });
    window.dispatchEvent(new Event('rdu:filters'));
  }

  function activateChapter(chapterId) {
    state.archiveVisible = true;
    state.activeChapter = chapterId;
    state.timelineIndex = null;
    stopTimeline();
    updateTimelineStatus();
    const chapter = chapters.find(c => c.id === chapterId);
    document.querySelectorAll('.chapter-card').forEach(card => card.classList.toggle('active', card.dataset.chapter === chapterId));
    if (chapter) { map.flyTo([chapter.center[1], chapter.center[0]], chapter.zoom, { duration: reducedMotion ? 0 : .9 }); applyFilters(); }
    if (window.innerWidth <= 980) setStoryPanel(false);
  }

  function renderPinPanel(feature, timelineEvent=null) {
    window.dispatchEvent(new Event('rdu:archive-pin'));
    state.selectedFeature = feature;
    state.selectedTimelineEvent = timelineEvent;
    const p = feature.properties;
    const title = titleFor(feature);
    const layer = layerFor(feature);
    const description = descriptionFor(feature);
    const langName = tr('languageName');
    const dateChips = (p.dates || []).map(d => `<span class="date-chip" title="${escapeHtml(d.type)}">${escapeHtml(d.raw)}</span>`).join('') || `<span class="date-chip">${escapeHtml(tr('noDate'))}</span>`;
    const imageGrid = (p.images || []).map(im => `<button type="button" class="image-preview" data-full="${escapeHtml(im.local_path || im.display_url)}" aria-label="${escapeHtml(title)} · ${escapeHtml(tr('image'))} ${im.index}"><img src="${escapeHtml(im.thumbnail_path || im.local_path || im.display_url)}" loading="lazy" decoding="async" width="320" height="220" alt="${escapeHtml(title)} · ${escapeHtml(tr('image'))} ${im.index}" /></button>`).join('');
    const sources = (p.source_links || []).map((url, idx) => `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener"><span>${escapeHtml(tr('source'))} ${idx + 1}</span></a>`).join('');
    const timelineHtml = timelineEvent ? `<div class="timeline-current"><strong>${escapeHtml(tr('timeline'))}</strong><br>${escapeHtml(eventLabel(timelineEvent))}</div>` : '';
    el.pinPanel.innerHTML = `<div class="pin-header">
        <button class="pin-close" type="button" aria-label="${escapeHtml(tr('close'))}">×</button>
        <span class="pin-layer"><span class="color-dot" style="background:${escapeHtml(p.style_color)}"></span>${escapeHtml(layer)}</span><span class="pin-lang-badge">${escapeHtml(langName)}</span>
        <h2>${escapeHtml(title)}</h2>
        <div class="date-list">${dateChips}</div>
      </div>
      <div class="pin-body">
        ${timelineHtml}
        ${state.language !== 'it' ? `<div class="translation-note">${escapeHtml(tr('translationNote'))}</div>` : ''}
        ${imageGrid ? `<h3>${escapeHtml(tr('imagesHeading'))} (${p.image_count})</h3><div class="image-grid">${imageGrid}</div>` : `<p class="desc-box empty">${escapeHtml(tr('noImages'))}</p>`}
        <h3>${escapeHtml(tr('noteHeading'))}</h3>
        <div class="desc-box ${description ? '' : 'empty'}">${escapeHtml(description || tr('noDescription'))}</div>
        ${sources ? `<h3>${escapeHtml(tr('sourceLinks'))}</h3><div class="source-list">${sources}</div>` : ''}
        <h3>${escapeHtml(tr('dataNote'))}</h3>
        <div class="desc-box">${escapeHtml(tr('dataNoCreated'))}</div>
      </div>`;
    el.pinPanel.classList.add('open');
    el.pinPanel.querySelector('.pin-close').addEventListener('click', () => el.pinPanel.classList.remove('open'));
    el.pinPanel.querySelectorAll('.image-preview').forEach(button => {
      button.addEventListener('click', () => openLightbox(button.dataset.full, button.getAttribute('aria-label')));
      button.querySelector('img').addEventListener('error', () => {
        button.classList.add('image-unavailable');
        button.textContent = tr('imageUnavailable');
      }, { once: true });
    });
  }

  function openLightbox(src, alt) {
    const box = document.createElement('div');
    box.className = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', alt);
    box.innerHTML = `<button type="button" aria-label="${escapeHtml(tr('close'))}">×</button><img src="${escapeHtml(src)}" decoding="async" alt="${escapeHtml(alt)}" />`;
    const previousFocus = document.activeElement;
    const close = () => { box.remove(); document.removeEventListener('keydown', onKey); previousFocus?.focus(); };
    const onKey = event => { if (event.key === 'Escape') close(); if (event.key === 'Tab') { event.preventDefault(); box.querySelector('button').focus(); } };
    document.addEventListener('keydown', onKey);
    box.addEventListener('click', ev => { if (ev.target === box || ev.target.tagName === 'BUTTON') close(); });
    box.querySelector('img').addEventListener('error', () => { box.querySelector('img').replaceWith(Object.assign(document.createElement('p'), { textContent: tr('imageUnavailable') })); }, { once: true });
    document.body.appendChild(box);
    box.querySelector('button').focus();
  }

  function updateExternalLinks() {
    const c = map.getCenter();
    const z = Math.round(map.getZoom());
    const satUrl = `https://satellites.pro/Ukraine_map#${c.lat.toFixed(6)},${c.lng.toFixed(6)},${z}`;
    const geoUrl = `https://geofact.wararchive.in.ua/#${Math.max(1,z)}/${c.lat.toFixed(3)}/${c.lng.toFixed(3)}`;
    if (el.openSatellites) el.openSatellites.href = satUrl;
    if (el.openGeoFact) el.openGeoFact.href = geoUrl;
    if (el.topSatellites) el.topSatellites.href = satUrl;
    if (el.topGeoFact) el.topGeoFact.href = geoUrl;
  }

  function updateTimelineStatus() {
    if (state.timelineIndex === null || !state.timelineEvents.length) {
      el.timelineStatus.textContent = tr('timelineOff');
      return;
    }
    const ev = state.timelineEvents[state.timelineIndex];
    el.timelineRange.value = state.timelineIndex;
    el.timelineStatus.textContent = `${tr('timelineUpTo')} ${ev.dateRaw || ev.date} · ${titleFor(ev.feature)}`;
  }

  function activateTimeline(index, fly=true) {
    if (!state.timelineEvents.length) return;
    state.archiveVisible = true;
    state.timelineIndex = Math.max(0, Math.min(index, state.timelineEvents.length - 1));
    state.activeYear = 'all';
    state.activeChapter = null;
    document.querySelectorAll('.chapter-card').forEach(card => card.classList.remove('active'));
    el.yearFilters.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.year === 'all'));
    updateTimelineStatus();
    applyFilters();
    const ev = state.timelineEvents[state.timelineIndex];
    const coords = ev.feature.geometry.coordinates;
    if (fly) map.flyTo([coords[1], coords[0]], Math.max(map.getZoom(), 15), { duration: reducedMotion ? 0 : .7 });
    renderPinPanel(ev.feature, ev);
  }

  function stopTimeline() {
    if (state.playTimer) { clearInterval(state.playTimer); state.playTimer = null; }
    el.playTimeline.textContent = tr('play');
    updateQuickPlayback();
  }
  function updateQuickPlayback() {
    const playing = state.playTimer !== null;
    el.quickPlay.textContent = playing ? '❚❚' : '▶';
    el.quickPlay.setAttribute('aria-label', tr(playing ? 'pause' : 'play'));
    el.quickPlay.title = tr(playing ? 'pause' : 'play');
    el.quickPlay.setAttribute('aria-pressed', String(playing));
  }

  function playTimeline() {
    if (state.playTimer) { stopTimeline(); return; }
    if (state.timelineIndex === null) activateTimeline(0, true);
    el.playTimeline.textContent = tr('pause');
    state.playTimer = setInterval(() => {
      if (state.timelineIndex === null || state.timelineIndex >= state.timelineEvents.length - 1) { stopTimeline(); return; }
      activateTimeline(state.timelineIndex + 1, true);
    }, 2200);
    updateQuickPlayback();
  }

  function clearTimeline() {
    state.timelineIndex = null;
    stopTimeline();
    updateTimelineStatus();
    applyFilters();
  }

  function applyLanguageUI() {
    document.documentElement.lang = state.language === 'uk' ? 'uk' : state.language === 'ru' ? 'ru' : state.language === 'it' ? 'it' : 'en';
    el.languageSelect.value = state.language;
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = tr(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', tr(node.dataset.i18nAria)); });
    [['.leaflet-control-zoom-in', 'zoomIn'], ['.leaflet-control-zoom-out', 'zoomOut']].forEach(([selector, key]) => {
      const button = map.getContainer().querySelector(selector);
      button.title = tr(key);
      button.setAttribute('aria-label', tr(key));
    });
    el.searchInput.placeholder = tr('searchPlaceholder');
    renderStats();
    renderLayerFilters();
    renderYearFilters();
    renderChapters();
    renderBasemapControl();
    updateQuickPlayback();
    updateTimelineStatus();
    applyFilters();
    state.markers.forEach(({ marker }) => { if (marker.isPopupOpen()) marker.setPopupContent(popupHtml(state.featureById.get(marker.rduId))); });
    if (el.pinPanel.classList.contains('open') && state.selectedFeature) renderPinPanel(state.selectedFeature, state.selectedTimelineEvent);
    window.dispatchEvent(new Event('rdu:language'));
  }

  let searchTimer;
  el.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
    state.search = el.searchInput.value.trim().toLocaleLowerCase();
    state.activeChapter = null;
    document.querySelectorAll('.chapter-card').forEach(card => card.classList.remove('active'));
    applyFilters();
    }, 120);
  });

  el.languageSelect.addEventListener('change', () => {
    state.language = LANGS.includes(el.languageSelect.value) ? el.languageSelect.value : 'en';
    try { localStorage.setItem('rdu-language', state.language); } catch (_) {}
    const url = new URL(location.href); url.searchParams.set('lang', state.language); history.replaceState(null, '', url);
    applyLanguageUI();
  });

  el.resetFilters.addEventListener('click', () => {
    state.archiveVisible = true;
    clearTimeout(searchTimer);
    state.activeYear = 'all';
    state.search = '';
    state.enabledLayers = new Set(summary.layers.map(l => l.name_en || l.name));
    state.activeChapter = null;
    state.timelineIndex = null;
    stopTimeline();
    el.searchInput.value = '';
    el.yearFilters.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.year === 'all'));
    el.layerFilters.querySelectorAll('input').forEach(i => i.checked = true);
    document.querySelectorAll('.chapter-card').forEach(card => card.classList.remove('active'));
    updateTimelineStatus();
    applyFilters();
    window.dispatchEvent(new Event('rdu:reset'));
  });

  let timelineFrame;
  el.timelineRange.addEventListener('input', () => {
    cancelAnimationFrame(timelineFrame);
    timelineFrame = requestAnimationFrame(() => activateTimeline(Number(el.timelineRange.value), true));
  });
  el.prevTimeline.addEventListener('click', () => activateTimeline((state.timelineIndex ?? 0) - 1, true));
  el.nextTimeline.addEventListener('click', () => activateTimeline((state.timelineIndex ?? -1) + 1, true));
  el.playTimeline.addEventListener('click', playTimeline);
  el.clearTimeline.addEventListener('click', clearTimeline);
  el.quickPrevious.addEventListener('click', () => el.prevTimeline.click());
  el.quickPlay.addEventListener('click', playTimeline);
  el.quickNext.addEventListener('click', () => el.nextTimeline.click());
  el.quickReset.addEventListener('click', () => el.resetFilters.click());
  const mobileLayout = window.matchMedia('(max-width: 980px)');
  function setStoryPanel(open, restoreFocus = true) {
    open = mobileLayout.matches && open;
    document.body.classList.toggle('panel-open', open);
    el.togglePanel.setAttribute('aria-expanded', String(open));
    el.sheetToggle.setAttribute('aria-expanded', String(open));
    el.storyBackdrop.hidden = !open;
    el.storyContent.inert = mobileLayout.matches && !open;
    if (mobileLayout.matches) el.storyContent.setAttribute('aria-hidden', String(!open));
    else el.storyContent.removeAttribute('aria-hidden');
    if (mobileLayout.matches && open) {
      el.storyPanel.setAttribute('role', 'dialog');
      el.storyPanel.setAttribute('aria-modal', 'true');
    } else {
      ['role', 'aria-modal', 'aria-hidden'].forEach(name => el.storyPanel.removeAttribute(name));
    }
    if (open || (restoreFocus && mobileLayout.matches)) el.sheetToggle.focus();
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }
  el.togglePanel.addEventListener('click', () => setStoryPanel(!document.body.classList.contains('panel-open')));
  let sheetPointerY = null, suppressSheetClick = false;
  el.sheetToggle.addEventListener('click', () => {
    if (suppressSheetClick) { suppressSheetClick = false; return; }
    setStoryPanel(!document.body.classList.contains('panel-open'));
  });
  el.sheetToggle.addEventListener('pointerdown', event => {
    if (!mobileLayout.matches) return;
    sheetPointerY = event.clientY;
    el.sheetToggle.setPointerCapture(event.pointerId);
  });
  el.sheetToggle.addEventListener('pointerup', event => {
    if (sheetPointerY === null) return;
    const delta = event.clientY - sheetPointerY;
    sheetPointerY = null;
    if (Math.abs(delta) < 40) return;
    suppressSheetClick = true;
    setStoryPanel(delta < 0);
    setTimeout(() => { suppressSheetClick = false; }, 400);
  });
  el.sheetToggle.addEventListener('pointercancel', () => { sheetPointerY = null; });
  el.closeStory.addEventListener('click', () => setStoryPanel(false));
  el.quickLayers.addEventListener('click', () => {
    setStoryPanel(true);
    requestAnimationFrame(() => {
      const details = el.layerFilters.closest('details');
      details.open = true;
      const top = details.getBoundingClientRect().top - el.storyContent.getBoundingClientRect().top + el.storyContent.scrollTop - 12;
      el.storyContent.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
      details.querySelector('summary').focus({ preventScroll: true });
    });
  });
  el.storyBackdrop.addEventListener('click', () => setStoryPanel(false));
  document.addEventListener('keydown', event => {
    if (!document.body.classList.contains('panel-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); setStoryPanel(false); }
    if (event.key === 'Tab') {
      const focusable = [...el.storyPanel.querySelectorAll('button, input, select, a[href], summary, [tabindex="0"]')]
        .filter(node => !node.disabled && node.offsetParent !== null);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  mobileLayout.addEventListener('change', () => setStoryPanel(false, false));
  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  });
  setStoryPanel(false, false);
  map.on('moveend zoomend', updateExternalLinks);

  buildTimelineEvents();
  applyLanguageUI();
  buildMarkers();
  const construction = window.RDUConstruction?.mount({map, state, applyFilters, renderPinPanel, titleFor, setStoryPanel, openLightbox,
    resetArchive() {
      state.activeYear='all'; state.activeChapter=null; state.timelineIndex=null; state.search='';
      state.enabledLayers=new Set(summary.layers.map(l=>l.name_en||l.name));
      el.searchInput.value=''; stopTimeline(); renderYearFilters(); renderLayerFilters(); renderChapters(); updateTimelineStatus();
    }
  });
  updateExternalLinks();
  const initialPin = state.featureById.get(query.get('pin'));
  if (initialPin) {
    const coords = initialPin.geometry.coordinates;
    map.setView([coords[1], coords[0]], 16);
    renderPinPanel(initialPin);
  }
})();
