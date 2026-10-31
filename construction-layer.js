/* V2: a separate, dated source layer. Original evidence IDs/data stay untouched. */
(function () {
  'use strict';
  const data = window.RDU_CONSTRUCTION;
  if (!data) return;
  for (const [lang, labels] of Object.entries(data.labels)) {
    for (const key of ['heroTitle', 'heroEyebrow', 'heroLead', 'pageTitle']) window.RDU_UI[lang][key] = labels[key];
    window.RDU_UI[lang].pins = labels.archivePins;
    window.RDU_UI[lang].layersStat = labels.archiveLayers;
    window.RDU_UI[lang].visible = labels.archiveVisible;
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = value => { try { const u = new URL(value, location.href); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } };
  window.RDUConstruction = { mount };

  function mount(api) {
    const {map, state, applyFilters, resetArchive, renderPinPanel, setStoryPanel, titleFor, openLightbox} = api;
    const story = document.getElementById('constructionStory');
    const filters = document.getElementById('constructionFilters');
    const panel = document.getElementById('pinPanel');
    const legend = document.createElement('div');
    legend.className = 'construction-legend';
    document.querySelector('.map-pane').appendChild(legend);
    const layer = L.layerGroup().addTo(map);
    map.createPane('constructionPane').style.zIndex = 625;
    let statuses = new Set([0, 2]), activeStep = null, selected = null;
    const label = key => data.labels[state.language][key] || data.labels.en[key] || key;
    const format = value => new Intl.NumberFormat(state.language, {maximumFractionDigits: 1}).format(value);
    const statusLabel = p => label(p.objStatus === 2 ? 'completed' : 'building');
    const color = p => p.objStatus === 2 ? '#087f78' : '#c56b08';
    const sourceLink = id => { const s = data.sources[id]; return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`; };
    const byId = new Map(data.features.map(f => [String(f.properties.objId), f]));
    const searchIndex = new Map(data.features.map(f => [String(f.properties.objId), Object.values(f.properties).filter(v => typeof v === 'string' || typeof v === 'number').join(' ').toLocaleLowerCase()]));
    const markers = data.features.map(feature => {
      const p = feature.properties, [lon, lat] = feature.geometry.coordinates;
      const marker = L.circleMarker([lat, lon], {pane: 'constructionPane', radius: 7, color: '#fff', weight: 2, fillColor: color(p), fillOpacity: .95});
      marker.bindTooltip(() => esc(p.nameObj || p.objAddr) + '<br>' + esc(statusLabel(p)));
      marker.on('click', () => openBuilding(feature, false));
      return {feature, marker};
    });

    function openStory() {
      setStoryPanel(true);
      requestAnimationFrame(() => story.scrollIntoView({block: 'start', behavior: 'auto'}));
    }
    function chooseStep(id) {
      selected = null;
      panel.classList.remove('open');
      delete panel.dataset.kind;
      activeStep = id;
      const step = data.steps.find(s => s.id === id);
      resetArchive();
      state.archiveVisible = step ? step.archive : true;
      statuses = new Set(!step || step.construction ? [0, 2] : []);
      applyFilters();
      render();
      map.setView([47.100, 37.555], 13);
      const url = new URL(location.href);
      if (id) url.searchParams.set('story', id); else url.searchParams.delete('story');
      url.searchParams.delete('building');
      history.replaceState(null, '', url);
    }

    function render() {
      story.innerHTML = `<div class="eyebrow">${esc(label('kicker'))}</div><h2>${esc(label('title'))}</h2><p>${esc(label('intro'))}</p>
        <div class="occupation-steps">${data.steps.map((s,i) => `<article class="occupation-step${activeStep===s.id?' active':''}"><button type="button" data-step="${s.id}" aria-pressed="${activeStep===s.id}"><span>${i+1}</span>${esc(label(s.id+'Title'))}</button><p>${esc(label(s.id+'Body'))}</p><div class="evidence-citations">${s.sources.map(sourceLink).join(' · ')}</div></article>`).join('')}</div>
        <p class="evidence-limit">${esc(label('readingLimit'))}</p><button class="pill-button subtle" type="button" id="clearConstructionStory">${esc(label('clearStory'))}</button>
        <div class="construction-stats">${[['objects','objects'],['declared_apartments','apartments'],['detailed','details'],['images','photos']].map(([k,l])=>`<div><strong>${format(data.summary[k])}</strong><span>${esc(label(l))}</span></div>`).join('')}</div>
        <p class="capture-stamp">${esc(label('capture'))} · ${sourceLink('capture')}</p>`;
      story.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => chooseStep(b.dataset.step)));
      story.querySelector('#clearConstructionStory').addEventListener('click', () => chooseStep(null));
      filters.innerHTML = `<h3>${esc(label('layerTitle'))}</h3>
        <label class="construction-toggle"><input type="checkbox" data-construction="archive" ${state.archiveVisible?'checked':''}><span class="archive-symbol" aria-hidden="true">●</span><span>${esc(label('archive'))} <small>1,358</small></span></label>
        ${[2,0].map(status => `<label class="construction-toggle"><input type="checkbox" data-construction="${status}" ${statuses.has(status)?'checked':''}><span class="construction-symbol ${status===2?'complete':'building'}" aria-hidden="true"></span><span>${esc(label(status===2?'completed':'building'))} <small>${format(status===2?27:71)}</small></span></label>`).join('')}
        <p class="construction-note">${esc(label('layerNote'))}</p>
        <details class="building-browser"><summary><span id="constructionListCount"></span></summary><div id="constructionList" class="building-list"></div></details>
        <a class="source-link" href="sources/dom-rf/mariupol_construction.kmz" download>${esc(label('download'))} ↓</a>`;
      filters.querySelectorAll('[data-construction]').forEach(input => input.addEventListener('change', () => {
        activeStep = null;
        const key = input.dataset.construction;
        if (key === 'archive') state.archiveVisible = input.checked;
        else if (input.checked) statuses.add(Number(key)); else statuses.delete(Number(key));
        // Reset story selection in the URL as soon as the view is manually changed.
        const u = new URL(location.href); u.searchParams.delete('story'); history.replaceState(null, '', u);
        applyFilters(); render();
      }));
      update();
      if (selected && panel.classList.contains('open')) openBuilding(selected, false, true);
    }

    function update() {
      if (activeStep && (state.archiveVisible !== data.steps.find(s=>s.id===activeStep).archive || state.search || state.activeYear!=='all' || state.activeChapter)) {
        activeStep = null;
        story.querySelectorAll('[data-step]').forEach(b => b.setAttribute('aria-pressed','false'));
        story.querySelectorAll('.occupation-step').forEach(card => card.classList.remove('active'));
      }
      const archiveInput = filters.querySelector('[data-construction="archive"]');
      if (archiveInput) archiveInput.checked = state.archiveVisible;
      const visible = [];
      for (const item of markers) {
        const p = item.feature.properties;
        const show = statuses.has(p.objStatus) && (!state.search || searchIndex.get(String(p.objId)).includes(state.search));
        if (show) { if (!layer.hasLayer(item.marker)) layer.addLayer(item.marker); visible.push(item.feature); }
        else if (layer.hasLayer(item.marker)) layer.removeLayer(item.marker);
      }
      const count = `${format(visible.length)} ${label('visible')}`;
      legend.innerHTML = `<button type="button" class="construction-story-link">${esc(label('title'))} <span aria-hidden="true">↗</span></button><span class="construction-visible" id="constructionCount" aria-live="polite">${esc(count)}</span><div class="construction-key"><span><i class="construction-symbol complete"></i>${esc(label('completed'))}</span><span><i class="construction-symbol building"></i>${esc(label('building'))}</span></div>`;
      legend.querySelector('button').addEventListener('click', openStory);
      const list = document.getElementById('constructionList');
      if (list) {
        document.getElementById('constructionListCount').textContent = count;
        list.innerHTML = visible.length ? visible.map(f => `<button type="button" data-building="${f.properties.objId}"><span class="construction-symbol ${f.properties.objStatus===2?'complete':'building'}"></span><span><strong>${esc(f.properties.nameObj || f.properties.objAddr)}</strong><small>${esc(f.properties.devShortName)} · #${f.properties.objId}</small></span></button>`).join('') : `<p>${esc(label('noResults'))}</p>`;
        list.querySelectorAll('[data-building]').forEach(b => b.addEventListener('click', () => openBuilding(byId.get(b.dataset.building), true)));
      }
      // Preserve the original archive count and add the separate snapshot count.
      const sheet = document.getElementById('sheetMeta');
      sheet.textContent = document.getElementById('visibleCount').textContent + ' · ' + count;
    }

    function openBuilding(feature, fly = true, languageOnly = false) {
      selected = feature;
      state.selectedFeature = null;
      state.selectedTimelineEvent = null;
      const p = feature.properties;
      if (!languageOnly) {
        map.closePopup();
        if (fly) { const [lon,lat] = feature.geometry.coordinates; map.setView([lat,lon],16); }
        setStoryPanel(false, false);
        const url = new URL(location.href); url.searchParams.set('building',p.objId); url.searchParams.delete('pin'); history.replaceState(null,'',url);
      }
      const has = value => value !== null && value !== undefined && value !== '';
      const row = (key,value) => `<div><dt>${esc(label(key))}</dt><dd>${has(value)?esc(value):`<span class="missing-value">${esc(label('unavailable'))}</span>`}</dd></div>`;
      const nearby = p.nearby_archive.map(item => {
        const f = state.featureById.get(item.pin_id);
        return f ? `<button type="button" data-nearby="${esc(item.pin_id)}">${esc(titleFor(f))}<small>${format(item.distance_m)} ${esc(label('meters'))}</small></button>` : '';
      }).join('');
      const photo = p.local_image ? `<figure class="construction-photo"><button type="button" class="construction-photo-open" aria-label="${esc(label('photoAlt')+' '+(p.nameObj||p.objAddr))}"><img src="${esc(p.local_image)}" width="900" height="600" loading="lazy" decoding="async" alt="${esc(label('photoAlt')+' '+(p.nameObj||p.objAddr))}"></button><figcaption>${esc(label('photoCaption'))}</figcaption></figure>` : `<p class="construction-note">${esc(label('noPhoto'))}</p>`;
      const date = p.completion ? new Intl.DateTimeFormat(state.language,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(p.completion+'T00:00:00Z')) : null;
      panel.dataset.kind = 'construction';
      panel.innerHTML = `<div class="pin-header"><button class="pin-close" type="button" aria-label="${esc(label('close'))}">×</button><span class="pin-layer">ДОМ.РФ · #${p.objId}</span><h2>${esc(p.nameObj||p.objAddr)}</h2><span class="construction-status ${p.objStatus===2?'complete':'building'}">${esc(statusLabel(p))}</span></div>
        <div class="pin-body"><p class="construction-note">${esc(label('sourceNote'))}</p>${photo}<p class="capture-stamp">${esc(label('capture'))}<br>${esc(label(p.hasDetail?'detailFull':'detailMissing'))}</p>
        <dl class="construction-facts">${row('address',p.objAddr)}${row('developer',p.devShortName)}${row('inn',p.devInn)}${row('ogrn',p.devOgrn)}${row('director',p.devDirector)}${row('contractor',p.generalContractor)}${row('apartments',p.apartments)}${row('floors',has(p.floorMin)&&has(p.floorMax)?`${p.floorMin}–${p.floorMax}`:null)}${row('completion',date)}${row('price',has(p.avgPrice)?format(p.avgPrice):null)}${row('sold',has(p.sold_share_source_ratio)?format(p.sold_share_source_ratio*100)+'%':null)}</dl>
        <p class="construction-note">${esc(label('soldNote'))}</p><p class="construction-note">${esc(label('dateNote'))}</p><p class="construction-note">${esc(label('namesNote'))}</p>
        <div class="source-list"><a class="source-link" href="${esc(safeURL(p.source_url))}" target="_blank" rel="noopener noreferrer">${esc(label('sourceRecord'))} ↗</a>${p.rpdPdfLink&&safeURL(p.rpdPdfLink)?`<a class="source-link" href="${esc(safeURL(p.rpdPdfLink))}" target="_blank" rel="noopener noreferrer">${esc(label('declaration'))} ↗</a>`:''}<a class="source-link" href="sources/dom-rf/${p.hasDetail?'object_details.json':'mariupol_detailed.geojson'}" target="_blank" rel="noopener">${esc(label('rawRecord'))} ↗</a></div>
        <h3>${esc(label('nearby'))}</h3><p class="construction-note">${esc(label('nearbyNote'))}</p><div class="nearby-archive">${nearby||`<p>${esc(label('noneNearby'))}</p>`}</div><p class="evidence-limit">${esc(label('readingLimit'))}</p></div>`;
      panel.classList.add('open');
      panel.querySelector('.pin-close').addEventListener('click', closeBuilding);
      panel.querySelector('.construction-photo-open')?.addEventListener('click', () => openLightbox(p.local_image,label('photoAlt')+' '+(p.nameObj||p.objAddr)));
      panel.querySelector('.construction-photo img')?.addEventListener('error', event => { event.target.replaceWith(Object.assign(document.createElement('p'), {textContent:label('noPhoto')})); });
      panel.querySelectorAll('[data-nearby]').forEach(button => button.addEventListener('click', () => {
        const target = state.featureById.get(button.dataset.nearby); selected = null;
        const u=new URL(location.href);u.searchParams.delete('building');u.searchParams.set('pin',target.properties.id);history.replaceState(null,'',u);
        const [lon,lat] = target.geometry.coordinates; map.setView([lat,lon],17); renderPinPanel(target);
      }));
    }
    function closeBuilding() {
      selected = null; panel.classList.remove('open'); delete panel.dataset.kind;
      const u = new URL(location.href); u.searchParams.delete('building'); history.replaceState(null,'',u);
    }
    window.addEventListener('rdu:filters', update);
    window.addEventListener('rdu:language', render);
    window.addEventListener('rdu:archive-pin', () => { selected = null; delete panel.dataset.kind; const u=new URL(location.href);u.searchParams.delete('building');history.replaceState(null,'',u); });
    window.addEventListener('rdu:reset', () => { activeStep=null; statuses=new Set([0,2]); state.archiveVisible=true; closeBuilding(); render(); applyFilters(); const u=new URL(location.href);u.searchParams.delete('story');history.replaceState(null,'',u); });
    render();
    const q = new URLSearchParams(location.search);
    if (data.steps.some(s=>s.id===q.get('story'))) chooseStep(q.get('story'));
    if (byId.has(q.get('building'))) openBuilding(byId.get(q.get('building')));
    return {layer, markers, chooseStep, openBuilding, data};
  }
})();
