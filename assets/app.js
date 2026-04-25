/* Douban random picker — vanilla JS, two-list (wish + collect) tabs. */
(function () {
    'use strict';

    /* ───────────────────── poster CDN routing ────────────────── */
    // Posters are committed to main but excluded from the GitHub Pages bundle
    // (they'd inflate the deploy by ~30 MB). When running off a hosted origin
    // we rewrite each local-relative `data/posters/...` path to a jsDelivr URL
    // so the browser fetches the raw blob from GitHub's CDN instead.
    const CDN_OWNER = 'lfkdsk';
    const CDN_REPO = 'douban-selector';
    const CDN_REF = 'main';
    const CDN_BASE = `https://cdn.jsdelivr.net/gh/${CDN_OWNER}/${CDN_REPO}@${CDN_REF}/`;
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0', ''].includes(location.hostname);
    function posterUrl(cover) {
        if (!cover) return '';
        if (cover.startsWith('http://') || cover.startsWith('https://')) return cover;
        return isLocal ? cover : CDN_BASE + cover.replace(/^\.?\//, '');
    }

    /* ───────────────────── state ─────────────────────────────── */
    const lists = {
        wish:    { path: 'data/wishlist.json',    label: '想看', data: null },
        collect: { path: 'data/collectlist.json', label: '看过', data: null },
    };

    const state = {
        active: 'wish',
        filtered: [],
        filters: {
            search: '',
            genres: new Set(),
            countries: new Set(),
            decades: new Set(),
            languages: new Set(),
            ratings: new Set(),
        },
        sort: 'mark_date_desc',
        randomSeed: Math.random(),
    };

    const els = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheEls();
        try {
            const [wish, collect] = await Promise.all([
                fetch(lists.wish.path,    { cache: 'no-cache' }).then(r => r.ok ? r.json() : null),
                fetch(lists.collect.path, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null),
            ]);
            lists.wish.data = wish;
            lists.collect.data = collect;
            if (!wish && !collect) throw new Error('no data files loaded');
        } catch (e) {
            console.error(e);
            els.grid.innerHTML = `<p class="empty">无法加载 data/*.json，请通过 HTTP 服务访问本页。<br/>错误：${e.message}</p>`;
            return;
        }
        bindEvents();
        renderTabs();
        switchTo('wish');
    }

    function cacheEls() {
        els.metaUpdated = document.getElementById('meta-updated');
        els.profileLink = document.getElementById('profile-link');
        els.sourceLink = document.getElementById('source-link');

        els.heroKicker = document.getElementById('hero-kicker');
        els.heroTitle = document.getElementById('hero-title');
        els.ledePrefix = document.getElementById('lede-prefix');
        els.ledeCount = document.getElementById('lede-count');
        els.ledeLabel = document.getElementById('lede-label');
        els.ledeAction = document.getElementById('lede-action');

        els.tabCounts = {
            wish: document.getElementById('tab-count-wish'),
            collect: document.getElementById('tab-count-collect'),
        };
        els.tabs = document.querySelectorAll('.tab');

        els.rollBtn = document.getElementById('roll-btn');
        els.rollLabel = els.rollBtn.querySelector('.btn-label');
        els.pickStage = document.getElementById('pick-stage');

        els.search = document.getElementById('search-input');
        els.resetBtn = document.getElementById('reset-btn');
        els.resultCount = document.getElementById('result-count');
        els.sortSelect = document.getElementById('sort-select');

        els.fGenres = document.getElementById('filter-genres');
        els.fCountries = document.getElementById('filter-countries');
        els.fDecades = document.getElementById('filter-decades');
        els.fLanguages = document.getElementById('filter-languages');
        els.fRatings = document.getElementById('filter-ratings');
        els.fRatingGroup = document.getElementById('filter-rating-group');

        els.gridHeading = document.getElementById('grid-heading');
        els.grid = document.getElementById('movie-grid');
        els.empty = document.getElementById('empty-state');

        els.modal = document.getElementById('modal');
        els.modalContent = els.modal.querySelector('.modal-content');
    }

    /* ───────────────────── tabs ──────────────────────────────── */

    function renderTabs() {
        for (const key of Object.keys(lists)) {
            const d = lists[key].data;
            if (els.tabCounts[key]) {
                els.tabCounts[key].textContent = d ? d.movies.length : '—';
            }
        }
    }

    function switchTo(key) {
        if (!lists[key] || !lists[key].data) return;
        state.active = key;
        // reset filters when switching tabs
        state.filters.search = '';
        state.filters.genres.clear();
        state.filters.countries.clear();
        state.filters.decades.clear();
        state.filters.languages.clear();
        state.filters.ratings.clear();
        els.search.value = '';

        // Update tab UI
        els.tabs.forEach(t => t.classList.toggle('on', t.dataset.list === key));

        // Update hero copy
        const isWish = key === 'wish';
        els.heroKicker.textContent = isWish ? "TONIGHT'S PICK" : 'REVISIT';
        els.heroTitle.innerHTML = isWish
            ? '不知道看什么？<br/><span class="accent">让命运替你挑一部。</span>'
            : '想再看一部？<br/><span class="accent">回顾你看过的影片。</span>';
        els.ledeLabel.textContent = lists[key].label;
        els.ledeAction.textContent = isWish ? '随机抽取' : '随机回顾';
        els.rollLabel.textContent = isWish ? '抽 一 部' : '回 顾 一 部';
        els.gridHeading.textContent = lists[key].label + '影片';

        // Update profile / source link based on type
        els.profileLink.href = `https://www.douban.com/people/${lists[key].data.user || 'lfkdsk'}/`;
        els.sourceLink.href = `https://movie.douban.com/people/${lists[key].data.user || 'lfkdsk'}/${key}`;

        // metadata
        const movies = lists[key].data.movies;
        const dates = movies.map(m => m.mark_date).filter(Boolean).sort();
        els.metaUpdated.textContent = dates.length ? `最近一次 ${dates[dates.length - 1]}` : '';
        els.ledeCount.textContent = movies.length;

        // rating filter only meaningful for collect
        els.fRatingGroup.hidden = isWish;

        // Reset pick stage to empty state
        els.pickStage.innerHTML = `
            <div class="pick-empty">
                <div class="reel">
                    <div class="reel-strip"><span>?</span><span>?</span><span>?</span></div>
                </div>
                <p class="hint">点击「${els.rollLabel.textContent}」开始</p>
            </div>`;

        document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
        buildFilters();
        applyFilters();
    }

    /* ───────────────────── filters UI ────────────────────────── */

    function activeMovies() { return lists[state.active].data.movies; }

    function buildFilters() {
        const all = activeMovies();
        renderChips(els.fGenres,    countBy(all, m => m.genres),    'genres');
        renderChips(els.fCountries, countBy(all, m => m.countries), 'countries', 14);
        renderChips(els.fDecades,   countBy(all, m => [decadeOf(m.year)].filter(Boolean)), 'decades', null, decadeSort);
        renderChips(els.fLanguages, countBy(all, m => m.languages), 'languages', 12);
        if (state.active === 'collect') {
            const ratingMap = countBy(all, m => m.rating ? [`${m.rating}星`] : []);
            renderChips(els.fRatings, ratingMap, 'ratings', null, (a, b) => parseInt(b[0]) - parseInt(a[0]));
        }
    }

    function countBy(arr, getter) {
        const m = new Map();
        for (const item of arr) {
            for (const v of (getter(item) || [])) m.set(v, (m.get(v) || 0) + 1);
        }
        return m;
    }

    function renderChips(container, countMap, key, limit, customSort) {
        let entries = [...countMap.entries()];
        entries.sort(customSort || ((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh')));
        if (limit) entries = entries.slice(0, limit);
        container.innerHTML = '';
        for (const [val, count] of entries) {
            const btn = document.createElement('button');
            btn.className = 'chip';
            btn.dataset.value = val;
            btn.dataset.key = key;
            btn.innerHTML = `${val}<span class="count">${count}</span>`;
            btn.addEventListener('click', () => {
                btn.classList.toggle('on');
                if (state.filters[key].has(val)) state.filters[key].delete(val);
                else state.filters[key].add(val);
                applyFilters();
            });
            container.appendChild(btn);
        }
    }

    function decadeOf(year) {
        if (!year) return null;
        const y = parseInt(year, 10);
        if (!y || y < 1900) return null;
        return Math.floor(y / 10) * 10 + 's';
    }
    function decadeSort(a, b) { return parseInt(b[0]) - parseInt(a[0]); }

    /* ───────────────────── filtering ─────────────────────────── */

    function bindEvents() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchTo(tab.dataset.list));
        });
        els.search.addEventListener('input', () => {
            state.filters.search = els.search.value.trim().toLowerCase();
            applyFilters();
        });
        els.resetBtn.addEventListener('click', resetFilters);
        els.sortSelect.addEventListener('change', () => {
            state.sort = els.sortSelect.value;
            if (state.sort === 'random') state.randomSeed = Math.random();
            applyFilters();
        });
        els.rollBtn.addEventListener('click', rollPick);

        els.modal.addEventListener('click', (e) => {
            if (e.target.dataset.close !== undefined) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !els.modal.hidden) closeModal();
        });
    }

    function resetFilters() {
        state.filters.search = '';
        state.filters.genres.clear();
        state.filters.countries.clear();
        state.filters.decades.clear();
        state.filters.languages.clear();
        state.filters.ratings.clear();
        els.search.value = '';
        document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
        applyFilters();
    }

    function applyFilters() {
        const f = state.filters;
        const q = f.search;
        state.filtered = activeMovies().filter(m => {
            if (q) {
                const hay = (m.title + ' ' + (m.aka || []).join(' ') + ' ' + (m.people || []).join(' ')).toLowerCase();
                if (!hay.includes(q)) return false;
            }
            if (f.genres.size && !m.genres.some(g => f.genres.has(g))) return false;
            if (f.countries.size && !m.countries.some(c => f.countries.has(c))) return false;
            if (f.languages.size && !m.languages.some(l => f.languages.has(l))) return false;
            if (f.decades.size) {
                const d = decadeOf(m.year);
                if (!d || !f.decades.has(d)) return false;
            }
            if (f.ratings.size) {
                if (!m.rating || !f.ratings.has(`${m.rating}星`)) return false;
            }
            return true;
        });

        sortFiltered();
        renderGrid();
        els.resultCount.textContent = `${state.filtered.length} 部`;
    }

    function sortFiltered() {
        const arr = state.filtered;
        switch (state.sort) {
            case 'mark_date_desc':
                arr.sort((a, b) => (b.mark_date || '').localeCompare(a.mark_date || '')); break;
            case 'mark_date_asc':
                arr.sort((a, b) => (a.mark_date || '').localeCompare(b.mark_date || '')); break;
            case 'rating_desc':
                arr.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.mark_date || '').localeCompare(a.mark_date || '')); break;
            case 'year_desc':
                arr.sort((a, b) => (parseInt(b.year || 0)) - (parseInt(a.year || 0))); break;
            case 'year_asc':
                arr.sort((a, b) => (parseInt(a.year || 9999)) - (parseInt(b.year || 9999))); break;
            case 'title_asc':
                arr.sort((a, b) => a.title.localeCompare(b.title, 'zh')); break;
            case 'random': {
                const seed = state.randomSeed;
                arr.sort((a, b) => hash(a.id + seed) - hash(b.id + seed)); break;
            }
        }
    }

    function hash(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /* ───────────────────── grid render ───────────────────────── */

    function renderGrid() {
        if (!state.filtered.length) {
            els.grid.innerHTML = '';
            els.empty.hidden = false;
            return;
        }
        els.empty.hidden = true;
        const frag = document.createDocumentFragment();
        for (const m of state.filtered) frag.appendChild(makeCard(m));
        els.grid.replaceChildren(frag);
    }

    function makeCard(m) {
        const card = document.createElement('article');
        card.className = 'card';
        const subtitle = [m.year, m.countries[0], m.genres[0]].filter(Boolean).join(' · ');
        const rating = (state.active === 'collect' && m.rating)
            ? `<div class="card-stars">${'★'.repeat(m.rating)}<span class="card-stars-empty">${'★'.repeat(5 - m.rating)}</span></div>`
            : '';
        card.innerHTML = `
            <div class="poster" style="background-image:url('${escapeAttr(posterUrl(m.cover))}')">
                ${m.year ? `<div class="badge">${escapeHtml(m.year)}</div>` : ''}
                ${rating}
            </div>
            <div class="card-body">
                <div class="card-title">${escapeHtml(m.title)}</div>
                <div class="card-meta">${escapeHtml(subtitle)}</div>
            </div>
        `;
        card.addEventListener('click', () => openModal(m));
        return card;
    }

    /* ───────────────────── random pick ───────────────────────── */

    let rolling = false;
    function rollPick() {
        if (rolling) return;
        const pool = state.filtered.length ? state.filtered : activeMovies();
        if (!pool.length) return;
        rolling = true;
        els.rollBtn.disabled = true;

        let count = 0;
        const total = 14;
        const interval = setInterval(() => {
            count++;
            const m = pool[Math.floor(Math.random() * pool.length)];
            renderPick(m, true);
            if (count >= total) {
                clearInterval(interval);
                const final = pool[Math.floor(Math.random() * pool.length)];
                renderPick(final, false);
                els.rollBtn.disabled = false;
                rolling = false;
                els.rollLabel.textContent = state.active === 'wish' ? '换 一 部' : '换 一 部';
            }
        }, 80);
    }

    function renderPick(m, shuffling) {
        const tags = [
            ...(m.genres || []).slice(0, 3),
            ...(m.countries || []).slice(0, 2),
        ];
        const sub = [m.year, m.runtime, (m.languages || [])[0]].filter(Boolean).join(' · ');
        const stars = (state.active === 'collect' && m.rating)
            ? `<div class="pick-stars">${'★'.repeat(m.rating)}<span class="card-stars-empty">${'★'.repeat(5 - m.rating)}</span></div>`
            : '';
        els.pickStage.innerHTML = `
            <div class="pick-card ${shuffling ? 'shuffling' : ''}">
                <div class="pick-poster" style="background-image:url('${escapeAttr(posterUrl(m.cover))}')"></div>
                <div class="pick-info">
                    ${stars}
                    <div class="pick-title">${escapeHtml(m.title)}</div>
                    <div class="pick-sub">${escapeHtml(sub)}</div>
                    <div class="pick-tags">${tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>
                    ${shuffling ? '' : `<div class="pick-cta">点击查看详情 →</div>`}
                </div>
            </div>
        `;
        if (!shuffling) {
            els.pickStage.querySelector('.pick-card').addEventListener('click', () => openModal(m));
        }
    }

    /* ───────────────────── modal ─────────────────────────────── */

    function openModal(m) {
        const akaTxt = (m.aka && m.aka.length) ? m.aka.filter(t => t !== m.title).join(' / ') : '';
        const actorsGuess = (m.people && m.people.length) ? m.people.slice(0, 6).join(' / ') : '';
        const stars = m.rating
            ? `<div class="m-stars">${'★'.repeat(m.rating)}<span class="card-stars-empty">${'★'.repeat(5 - m.rating)}</span></div>`
            : '';
        const dateLabel = state.active === 'wish' ? '想看于' : '看过于';
        els.modalContent.innerHTML = `
            <div class="m-poster" style="background-image:url('${escapeAttr(posterUrl(m.cover))}')"></div>
            <div class="m-info">
                <h3>${escapeHtml(m.title)}</h3>
                ${akaTxt ? `<div class="m-aka">${escapeHtml(akaTxt)}</div>` : ''}
                ${stars}
                <div class="m-tags">
                    ${(m.genres || []).map(g => `<span>${escapeHtml(g)}</span>`).join('')}
                </div>
                <dl>
                    ${m.year ? `<dt>YEAR</dt><dd>${escapeHtml(m.year)}</dd>` : ''}
                    ${m.countries.length ? `<dt>地区</dt><dd>${m.countries.map(escapeHtml).join(' / ')}</dd>` : ''}
                    ${m.languages.length ? `<dt>语言</dt><dd>${m.languages.map(escapeHtml).join(' / ')}</dd>` : ''}
                    ${m.runtime ? `<dt>片长</dt><dd>${escapeHtml(m.runtime)}</dd>` : ''}
                    ${actorsGuess ? `<dt>主创</dt><dd>${escapeHtml(actorsGuess)}</dd>` : ''}
                    ${m.comment ? `<dt>短评</dt><dd>${escapeHtml(m.comment)}</dd>` : ''}
                    ${m.mark_date ? `<dt>${dateLabel}</dt><dd>${escapeHtml(m.mark_date)}</dd>` : ''}
                </dl>
                <a class="m-link" href="${escapeAttr(m.url)}" target="_blank" rel="noopener">
                    在豆瓣查看 →
                </a>
            </div>
        `;
        els.modal.hidden = false;
    }

    function closeModal() { els.modal.hidden = true; }

    /* ───────────────────── utils ─────────────────────────────── */

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function escapeAttr(s) { return escapeHtml(s); }
})();
