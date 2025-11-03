//Lógica principal de la app (Elden Ring)
document.addEventListener('DOMContentLoaded', () => {

  // Variables y referencias a elementos del DOM
  const BASE_URL = 'https://eldenring.fanapis.com/api/items';
  const grid = document.getElementById('grid'); // Contenedor de tarjetas
  const loadMoreBtn = document.getElementById('load-more'); // Botón para cargar más
  const searchInput = document.getElementById('search-input'); // Input de búsqueda
  const typeFilter = document.getElementById('type-filter'); // Filtro por tipo
  const sortSelect = document.getElementById('sort-select'); // Filtro de orden

  const modalBackdrop = document.getElementById('modal-backdrop'); // Fondo del modal
  const modalClose = document.getElementById('modal-close'); // Botón cerrar modal
  const modalTitle = document.getElementById('modal-title'); // Título modal
  const modalImg = document.getElementById('modal-img'); // Imagen modal
  const modalDesc = document.getElementById('modal-desc'); // Descripción modal
  const modalMeta = document.getElementById('modal-meta'); // Meta info modal
  const modalStats = document.getElementById('modal-stats'); // Stats modal
  const modalLore = document.getElementById('modal-lore'); // Lore modal
  const darkToggle = document.getElementById('dark-toggle'); // Botón modo oscuro

  // Variables de estado
  let currentPage = 0;
  const ITEMS_PER_PAGE = 12;
  let loading = false;
  let allTypes = new Set();
  let loadedItems = []; // Cache de ítems cargados

  // Lógica de tema claro/oscuro persistente
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

  // Función para abrir el modal de detalles
  function openModal(item){
    modalTitle.textContent = item.name || 'Ítem';
    modalImg.src = item.image || 'placeholder.png';
    modalImg.alt = `Imagen de ${item.name}`;
    modalDesc.textContent = (Array.isArray(item.description)? item.description.join('\n\n') : (item.description || 'Sin descripción.'));
    modalMeta.textContent = `Tipo: ${item.type || '—'}`;
    modalStats.innerHTML = ''; modalLore.textContent = '';
    if(item.attributes){
      modalStats.innerHTML = '<strong>Stats:</strong><div style="margin-top:6px">';
      for(const [k,v] of Object.entries(item.attributes)){
        modalStats.innerHTML += `<div style="font-size:13px; margin-top:4px;">${escapeHTML(k)}: ${escapeHTML(String(v))}</div>`;
      }
      modalStats.innerHTML += '</div>';
    }
    if(item.lore) modalLore.textContent = Array.isArray(item.lore)? item.lore.join('\n\n') : item.lore;
    modalBackdrop.classList.add('show');
    modalBackdrop.setAttribute('aria-hidden','false');
  }
  modalClose.addEventListener('click', ()=>{ modalBackdrop.classList.remove('show'); modalBackdrop.setAttribute('aria-hidden','true'); });
  modalBackdrop.addEventListener('click', (e)=>{ if(e.target === modalBackdrop) modalBackdrop.classList.remove('show'); });


  // Función para mostrar tarjetas "skeleton" mientras carga
  function renderSkeleton(count=6, replace=true){
    if(replace) grid.innerHTML = '';
    for(let i=0;i<count;i++){
      const s = document.createElement('div');
      s.className='card';
      s.innerHTML = `\n    <div class="skeleton media"></div>\n    <div class="skeleton title"></div>\n    <div class="skeleton line"></div>\n    <div class="skeleton line" style="width:80%"></div>\n  `;
      grid.appendChild(s);
    }
  }

  // Función para crear una tarjeta de ítem
  function createCard(item){
    const card = document.createElement('article');
    card.className='card fade-in';
    card.setAttribute('tabindex','0');
    card.innerHTML = `
      <div class="media"><img loading="lazy" src="${item.image || 'placeholder.png'}" alt="Imagen de ${escapeHTML(item.name||'Ítem')}"></div>
      <h3>${escapeHTML(item.name||'Ítem')}</h3>
      <p class="desc">${escapeHTML(shortenText(Array.isArray(item.description)? item.description.join(' '):(item.description||'Sin descripción.'), 140))}</p>
      <div class="meta">
        <div class="tag">${escapeHTML(item.type || '—')}</div>
        <div class="actions">
          <button class="icon-btn view" title="Ver detalle">🔍</button>
        </div>
      </div>
    `;
    card.querySelector('.view').addEventListener('click', ()=> openModal(item));
    card.addEventListener('animationend', ()=> card.classList.remove('fade-in'));
    return card;
  }

  // Utilidades para texto seguro y recortado
  function shortenText(text, max){ return text.length<=max ? text : text.slice(0,max-1)+'…' }
  function escapeHTML(s){ return String(s).replace(/[&<>"]|'/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]) ); }

  // Renderiza el grid de ítems (con filtros y orden)
  function renderGrid(items){
    grid.innerHTML = '';
    items.forEach(item => grid.appendChild(createCard(item)));
  }

  // Obtiene ítems de la API y los muestra
async function fetchItems(page = 0) {
  if (loading) return;
  loading = true;
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = 'Cargando...';

  // Crear skeletons y guardarlos para borrarlos luego
  const skeletons = [];
  for (let i = 0; i < ITEMS_PER_PAGE; i++) {
    const s = document.createElement('div');
    s.className = 'card skeleton-card';
    s.innerHTML = `
      <div class="skeleton media"></div>
      <div class="skeleton title"></div>
      <div class="skeleton line"></div>
      <div class="skeleton line" style="width:80%"></div>
    `;
    grid.appendChild(s);
    skeletons.push(s);
  }

  try {
    const url = `${BASE_URL}?limit=${ITEMS_PER_PAGE}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const json = await res.json();
    const items = json.data || [];

    items.forEach(it => {
      loadedItems.push(it);
      if (it.type) allTypes.add(it.type);
    });
    populateTypeFilter();

    // ❗️ Solo eliminar los skeletons recién creados
    skeletons.forEach(s => s.remove());

    if (items.length === 0) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'No hay más ítems';
    } else {
      items.forEach(item => grid.appendChild(createCard(item)));
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Cargar más ítems';

      if (page > 0 && items.length > 0) {
        setTimeout(() => {
          const last = grid.lastElementChild;
          if (last) {
            last.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    }

    currentPage = page + 1;

    const errMsg = document.getElementById('grid-error');
    if (errMsg) errMsg.remove();

  } catch (err) {
    console.error('Error obteniendo ítems', err);
    skeletons.forEach(s => s.remove());

    if (!document.getElementById('grid-error')) {
      const p = document.createElement('p');
      p.id = 'grid-error';
      p.style.color = '#ff6b6b';
      p.style.textAlign = 'center';
      p.textContent = 'Error al cargar ítems — revisa la consola';
      grid.parentNode.insertBefore(p, grid.nextSibling);
    }

    loadMoreBtn.disabled = false;
    loadMoreBtn.textContent = 'Cargar más ítems';

  } finally {
    loading = false;
  }
}


  // Filtrado y ordenamiento de los ítems cargados
  function filterGrid(){
    let items = loadedItems.slice();
    const q = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;
    const sort = sortSelect.value;
    if(q) items = items.filter(item =>
      (item.name||'').toLowerCase().includes(q) ||
      (Array.isArray(item.description)? item.description.join(' '):(item.description||'')).toLowerCase().includes(q) ||
      (item.type||'').toLowerCase().includes(q)
    );
    if(type) items = items.filter(item => (item.type||'').toLowerCase() === type.toLowerCase());
    if(sort==='name-asc') items.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    if(sort==='name-desc') items.sort((a,b)=> (b.name||'').localeCompare(a.name||''));
    renderGrid(items);
  }


  // Llena el filtro de tipos dinámicamente
  function populateTypeFilter(){
    const current = typeFilter.value;
    const list = Array.from(allTypes).sort();
    typeFilter.innerHTML = '<option value="">Todos los tipos</option>' + list.map(t=>`<option value="${t}">${t}</option>`).join('');
    typeFilter.value = current;
  }

  // Eventos principales de laapp
  loadMoreBtn.addEventListener('click', ()=> fetchItems(currentPage));
  searchInput.addEventListener('input', filterGrid);
  typeFilter.addEventListener('change', filterGrid);
  sortSelect.addEventListener('change', filterGrid);

  // Inicializa la app cargando los primeros ítems
  fetchItems(0);
  searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const first = grid.querySelector('.card:not([style*="display: none"]):not(.skeleton)'); if(first) first.scrollIntoView({behavior:'smooth', block:'center'}); } });
});