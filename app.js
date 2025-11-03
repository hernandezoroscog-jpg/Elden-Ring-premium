/* app.js — lógica de la app (Elden Ring Premium) */
document.addEventListener('DOMContentLoaded', () => {
  const BASE_URL = 'https://eldenring.fanapis.com/api/items';
  const grid = document.getElementById('grid');
  const loadMoreBtn = document.getElementById('load-more');
  const searchInput = document.getElementById('search-input');
  const typeFilter = document.getElementById('type-filter');
  const rarityFilter = document.getElementById('rarity-filter');
  const sortSelect = document.getElementById('sort-select');
  const favCount = document.getElementById('fav-count');

  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalClose = document.getElementById('modal-close');
  const modalTitle = document.getElementById('modal-title');
  const modalImg = document.getElementById('modal-img');
  const modalDesc = document.getElementById('modal-desc');
  const modalMeta = document.getElementById('modal-meta');
  const modalFav = document.getElementById('modal-fav');
  const modalStats = document.getElementById('modal-stats');
  const modalLore = document.getElementById('modal-lore');
  const modalSimilar = document.getElementById('modal-similar');

  const openFavsBtn = document.getElementById('open-favs');
  const darkToggle = document.getElementById('dark-toggle');

  let currentPage = 0;
  const ITEMS_PER_PAGE = 12;
  let loading = false;
  let allTypes = new Set();
  let loadedItems = []; // cache de ítems cargados

  // Favoritos en localStorage
  const LS_KEY = 'er_favs_v1';
  function getFavs(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)) || [] }catch(e){return []} }
  function saveFavs(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); updateFavCount() }
  function isFav(id){ return getFavs().includes(id) }
  function toggleFav(id){ const list=getFavs(); const idx=list.indexOf(id); if(idx>=0){ list.splice(idx,1) } else { list.push(id) } saveFavs(list) }
  function updateFavCount(){ favCount.textContent = getFavs().length }
  updateFavCount();

  // Tema persistente
  const THEME_KEY = 'er_theme_v1';
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  if(savedTheme === 'light') document.body.classList.add('light-theme'), darkToggle.textContent='Modo oscuro';
  else document.body.classList.remove('light-theme'), darkToggle.textContent='Modo claro';

  darkToggle.addEventListener('click', ()=>{
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem(THEME_KEY, isLight? 'light' : 'dark');
    darkToggle.textContent = isLight? 'Modo oscuro' : 'Modo claro';
  });

  // Modal
  function openModal(item){
    modalTitle.textContent = item.name || 'Ítem';
    modalImg.src = item.image || 'placeholder.png';
    modalImg.alt = `Imagen de ${item.name}`;
    modalDesc.textContent = (Array.isArray(item.description)? item.description.join('\n\n') : (item.description || 'Sin descripción.'));
    modalMeta.textContent = `Tipo: ${item.type || '—'} • Categoría: ${item.category || '—'}`;
    modalStats.innerHTML = ''; modalLore.textContent = '';
    // Stats y lore si los hay (la API puede no tenerlos)
    if(item.attributes){
      modalStats.innerHTML = '<strong>Stats:</strong><div style="margin-top:6px">';
      for(const [k,v] of Object.entries(item.attributes)){
        modalStats.innerHTML += `<div style="font-size:13px; margin-top:4px;">${escapeHTML(k)}: ${escapeHTML(String(v))}</div>`;
      }
      modalStats.innerHTML += '</div>';
    }
    if(item.lore) modalLore.textContent = Array.isArray(item.lore)? item.lore.join('\n\n') : item.lore;
    modalFav.textContent = isFav(item.uuid) ? 'Quitar de favoritos' : 'Agregar a favoritos';
    modalFav.onclick = ()=>{ toggleFav(item.uuid); modalFav.textContent = isFav(item.uuid)? 'Quitar de favoritos' : 'Agregar a favoritos'; };
    modalSimilar.onclick = ()=>{ findAndShowSimilar(item); };

    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden','false');
  }
  modalClose.addEventListener('click', ()=>{ modalBackdrop.classList.remove('show'); modalBackdrop.setAttribute('aria-hidden','true'); });
  modalBackdrop.addEventListener('click', (e)=>{ if(e.target === modalBackdrop) modalBackdrop.classList.remove('show'); });

  // Skeleton
  function renderSkeleton(count=6){ grid.innerHTML = ''; for(let i=0;i<count;i++){ const s = document.createElement('div'); s.className='card'; s.innerHTML = `\n    <div class=\"skeleton media\"></div>\n    <div class=\"skeleton title\"></div>\n    <div class=\"skeleton line\"></div>\n    <div class=\"skeleton line\" style=\"width:80%\"></div>\n  `; grid.appendChild(s); } }

  // Crear tarjeta
  function createCard(item){
    const card = document.createElement('article'); card.className='card'; card.setAttribute('tabindex','0');
    card.dataset.rarity = item.rarity || '';
    card.innerHTML = `
      <div class="media"><img loading="lazy" src="${item.image || 'placeholder.png'}" alt="Imagen de ${escapeHTML(item.name||'Ítem')}"></div>
      <h3>${escapeHTML(item.name||'Ítem')}</h3>
      <p class="desc">${escapeHTML(shortenText(Array.isArray(item.description)? item.description.join(' '):(item.description||'Sin descripción.'), 140))}</p>
      <div class="meta">
        <div class="tag">${escapeHTML(item.type || '—')}</div>
        <div class="actions">
          <button class="icon-btn fav" title="Favorito" data-id="${item.uuid}">${isFav(item.uuid) ? '★' : '☆'}</button>
          <button class="icon-btn view" title="Ver detalle">🔍</button>
        </div>
      </div>
    `;

    card.querySelector('.view').addEventListener('click', ()=> openModal(item));
    const favBtn = card.querySelector('.fav');
    favBtn.addEventListener('click', ()=>{ toggleFav(item.uuid); favBtn.textContent = isFav(item.uuid)? '★' : '☆'; updateFavCount(); });
    return card;
  }

  // Utils
  function shortenText(text, max){ if(text.length<=max) return text; return text.slice(0,max-1)+'…' }
  function escapeHTML(s){ return String(s).replace(/[&<>\"']/g, (c)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":"&#39;"}[c]) ) }

  // Fetch items y render
  async function fetchItems(page=0){
    if(loading) return;
    loading=true; renderSkeleton(6);
    try{
      const url = `${BASE_URL}?limit=${ITEMS_PER_PAGE}&page=${page}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const json = await res.json();
      const items = json.data || [];

      // almacenar en cache
      items.forEach(it => { loadedItems.push(it); if(it.type) allTypes.add(it.type); });
      populateTypeFilter();

      if(page===0) grid.innerHTML='';

      if(items.length===0){ loadMoreBtn.disabled=true; loadMoreBtn.textContent='No hay más ítems' }
      items.forEach(item => grid.appendChild(createCard(item)));

      currentPage = page+1;
    }catch(err){
      console.error('Error obteniendo ítems',err);
      grid.innerHTML = `<p style="color:#ff6b6b; text-align:center">Error al cargar ítems — revisa la consola</p>`;
    }finally{ loading=false }
  }

  // Filtrado local (sobre lo cargado)
  function filterGrid(){
    const q = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;
    const rarity = rarityFilter.value;
    const sort = sortSelect.value;

    const cards = Array.from(grid.children).filter(n=> !n.classList.contains('skeleton'));
    // Opcional: ordenar visualmente (simple approach: detach, sort array, re-append)
    if(sort){
      const nodes = cards.slice();
      nodes.sort((a,b)=>{
        const aName = a.querySelector('h3')?.textContent?.toLowerCase()||'';
        const bName = b.querySelector('h3')?.textContent?.toLowerCase()||'';
        if(sort==='name-asc') return aName.localeCompare(bName);
        if(sort==='name-desc') return bName.localeCompare(aName);
        return 0;
      });
      // reappend in order
      nodes.forEach(n => grid.appendChild(n));
    }

    const visibleCards = Array.from(grid.children).filter(n=> !n.classList.contains('skeleton'));
    visibleCards.forEach(card=>{
      const title = card.querySelector('h3')?.textContent?.toLowerCase()||'';
      const desc = card.querySelector('.desc')?.textContent?.toLowerCase()||'';
      const tag = card.querySelector('.tag')?.textContent?.toLowerCase()||'';
      let visible = true;
      if(q && !(title.includes(q) || desc.includes(q) || tag.includes(q))) visible=false;
      if(type && tag !== type.toLowerCase()) visible=false;
      if(rarity){ const r = card.dataset.rarity || ''; if(rarity && r !== rarity) visible=false }
      card.style.display = visible? 'block' : 'none';
    });
  }

  function populateTypeFilter(){
    const current = typeFilter.value;
    const list = Array.from(allTypes).sort();
    typeFilter.innerHTML = '<option value=\"\">Todos los tipos</option>' + list.map(t=>`<option value=\"${t}\">${t}</option>`).join('');
    typeFilter.value = current;
  }

  // Ver similares (simple demo: buscar por mismo tipo)
  function findAndShowSimilar(item){
    const sameType = loadedItems.filter(it => it.type === item.type && it.uuid !== item.uuid);
    if(sameType.length === 0){ alert('No se encontraron ítems similares cargados. Carga más o prueba otro filtro.'); return; }
    // Abrir el primero similar en modal
    openModal(sameType[0]);
  }

  // Eventos
  loadMoreBtn.addEventListener('click', ()=> fetchItems(currentPage));
  searchInput.addEventListener('input', ()=> filterGrid());
  typeFilter.addEventListener('change', ()=> filterGrid());
  rarityFilter.addEventListener('change', ()=> filterGrid());
  sortSelect.addEventListener('change', ()=> filterGrid());

  openFavsBtn.addEventListener('click', ()=>{
    const favs = getFavs();
    if(favs.length===0){ alert('No tienes favoritos aún. Marca estrellas en las tarjetas.'); return; }
    const found = favs.map(id => loadedItems.find(it => it.uuid === id)).filter(Boolean);
    if(found.length===0){ alert('Tus favoritos aún no están cargados en la lista. Carga más ítems o recarga la página.'); return; }
    openModal(found[0]);
  });

  // Inicial
  fetchItems(0);

  // Escuchar storage (otras pestañas)
  window.addEventListener('storage', (e)=>{ if(e.key===LS_KEY) updateFavCount() });

  // Enter en búsqueda: llevar al primer resultado visible
  searchInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ const first = grid.querySelector('.card:not([style*="display: none"])'); if(first) first.scrollIntoView({behavior:'smooth', block:'center'}); } });

});