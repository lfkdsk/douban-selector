/* Douban Wishlist random picker — vanilla JS */
(function () {
    'use strict';

    const state = {
        all: [],
        filtered: [],
        filters: {
            search: '',
            genres: new Set(),
            countries: new Set(),
            decades: new Set(),
            languages: new Set(),
        },
        sort: 'mark_date_desc',
        randomSeed: Math.random(),
    };

    const els = {};

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        cacheEls();
        try {
            const res = await fetch('data/wishlist.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(res.status);
            const data = await res.json();
            state.all = data.movies || [];
            updateMeta(data);
        } catch (e) {
            console.error(e);
            els.grid.innerHTML = `<p class="empty">无法加载 data/wishlist.json，请通过 HTTP 服务访问本页。<br/>错误：${e.message}</p>`;
            return;
        }
        buildFilters();
        bindEvents();
        applyFilters();
    }

    function cacheEls() {
        els.metaCount = document.getElementById('meta-count');
        els.metaUpdated = document.getElementById('meta-updated');
        els.ledeCount = document.getElementById('lede-count');
        els.profileLink = document.getElementById('profile-link');

        els.rollBtn = document.getElementById('roll-btn');
        els.rerollBtn = document.getElementById('reroll-btn');
        els.pickStage = document.getElementById('pick-stage');

        els.search = document.getElementById('search-input');
        els.resetBtn = document.getElementById('reset-btn');
        els.resultCount = document.getElementById('result-count');
        els.sortSelect = document.getElementById('sort-select');

        els.fGenres = document.getElementById('filter-genres');
        els.fCountries = document.getElementById('filter-countries');
        els.fDecades = document.getElementById('filter-decades');
        els.fLanguages = document.getElementById('filter-languages');

        els.grid = document.getElementById('movie-grid');
        els.empty = document.getElementById('empty-state');

        els.modal = document.getElementById('modal');
        els.modalContent = els.modal.querySelector('.modal-content');
    }

    function updateMeta(data) {
        const total = state.all.length;
        els.metaCount.textContent = `${total} 部`;
        els.ledeCount.textContent = total;
        const dates = state.all.map(m => m.mark_date).filter(Boolean).sort();
        if (dates.length) {
            els.metaUpdated.textContent = `更新于 ${dates[dates.length - 1]}`;
        }
        if (data.user) {
            els.profileLink.href = `https://www.douban.com/people/${data.user}/`;
            els.profileLink.textContent = '@' + data.user;
        }
    }

    /* ─────────────────────── filters UI ─────────────────────── */

    function buildFilters() {
        const counts = {
            genres: countBy(state.all, m => m.genres),
            countries: countBy(state.all, m => m.countries),
            decades: countBy(state.all, m => [decadeOf(m.year)].filter(Boolean)),
            languages: countBy(state.all, m => m.languages),
        };
        renderChips(els.fGenres, counts.genres, 'genres');
        renderChips(els.fCountries, counts.countries, 'countries', 14);
        renderChips(els.fDecades, counts.decades, 'decades', null, decadeSort);
        renderChips(els.fLanguages, counts.languages, 'languages', 12);
    }

    function countBy(arr, getter) {
        const m = new Map();
        for (const item of arr) {
            const vals = getter(item) || [];
            for (const v of vals) m.set(v, (m.get(v) || 0) + 1);
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

    function decadeSort(a, b) {
        return parseInt(b[0]) - parseInt(a[0]);
    }

    /* ─────────────────────── filtering ──────────────────────── */

    function bindEvents() {
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
        els.rerollBtn.addEventListener('click', rollPick);

        // Modal close
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
        els.search.value = '';
        document.querySelectorAll('.chip.on').forEach(c => c.classList.remove('on'));
        applyFilters();
    }

    function applyFilters() {
        const f = state.filters;
        const q = f.search;
        state.filtered = state.all.filter(m => {
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
                arr.sort((a, b) => (b.mark_date || '').localeCompare(a.mark_date || ''));
                break;
            case 'mark_date_asc':
                arr.sort((a, b) => (a.mark_date || '').localeCompare(b.mark_date || ''));
                break;
            case 'year_desc':
                arr.sort((a, b) => (parseInt(b.year || 0)) - (parseInt(a.year || 0)));
                break;
            case 'year_asc':
                arr.sort((a, b) => (parseInt(a.year || 9999)) - (parseInt(b.year || 9999)));
                break;
            case 'title_asc':
                arr.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
                break;
            case 'random': {
                // seedable shuffle so re-render is stable until reroll
                const seed = state.randomSeed;
                arr.sort((a, b) => hash(a.id + seed) - hash(b.id + seed));
                break;
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

    /* ─────────────────────── grid render ────────────────────── */

    function renderGrid() {
        if (!state.filtered.length) {
            els.grid.innerHTML = '';
            els.empty.hidden = false;
            return;
        }
        els.empty.hidden = true;
        const frag = document.createDocumentFragment();
        for (const m of state.filtered) {
            frag.appendChild(makeCard(m));
        }
        els.grid.replaceChildren(frag);
    }

    function makeCard(m) {
        const card = document.createElement('article');
        card.className = 'card';
        const subtitle = [m.year, m.countries[0], m.genres[0]].filter(Boolean).join(' · ');
        card.innerHTML = `
            <div class="poster" style="background-image:url('${escapeAttr(m.cover)}')">
                ${m.year ? `<div class="badge">${escapeHtml(m.year)}</div>` : ''}
            </div>
            <div class="card-body">
                <div class="card-title">${escapeHtml(m.title)}</div>
                <div class="card-meta">${escapeHtml(subtitle)}</div>
            </div>
        `;
        card.addEventListener('click', () => openModal(m));
        return card;
    }

    /* ─────────────────────── random pick ────────────────────── */

    let rolling = false;
    function rollPick() {
        if (rolling) return;
        const pool = state.filtered.length ? state.filtered : state.all;
        if (!pool.length) return;
        rolling = true;
        els.rollBtn.disabled = true;
        els.rerollBtn.disabled = true;

        let count = 0;
        const total = 14; // shuffle frames
        const interval = setInterval(() => {
            count++;
            const m = pool[Math.floor(Math.random() * pool.length)];
            renderPick(m, /*shuffling=*/true);
            if (count >= total) {
                clearInterval(interval);
                const final = pool[Math.floor(Math.random() * pool.length)];
                renderPick(final, false);
                els.rerollBtn.hidden = false;
                els.rollBtn.disabled = false;
                els.rerollBtn.disabled = false;
                rolling = false;
                els.rollBtn.querySelector('.btn-label').textContent = '换一部';
            }
        }, 80);
    }

    function renderPick(m, shuffling) {
        const tags = [
            ...(m.genres || []).slice(0, 3),
            ...(m.countries || []).slice(0, 2),
        ];
        const sub = [m.year, m.runtime, (m.languages || [])[0]].filter(Boolean).join(' · ');
        els.pickStage.innerHTML = `
            <div class="pick-card ${shuffling ? 'shuffling' : ''}">
                <div class="pick-poster" style="background-image:url('${escapeAttr(m.cover)}')"></div>
                <div class="pick-info">
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

    /* ─────────────────────── modal ──────────────────────────── */

    function openModal(m) {
        const akaTxt = (m.aka && m.aka.length) ? m.aka.filter(t => t !== m.title).join(' / ') : '';
        const directorGuess = guessDirector(m);
        const actorsGuess = guessActors(m);
        els.modalContent.innerHTML = `
            <div class="m-poster" style="background-image:url('${escapeAttr(m.cover)}')"></div>
            <div class="m-info">
                <h3>${escapeHtml(m.title)}</h3>
                ${akaTxt ? `<div class="m-aka">${escapeHtml(akaTxt)}</div>` : ''}
                <div class="m-tags">
                    ${(m.genres || []).map(g => `<span>${escapeHtml(g)}</span>`).join('')}
                </div>
                <dl>
                    ${m.year ? `<dt>YEAR</dt><dd>${escapeHtml(m.year)}</dd>` : ''}
                    ${m.countries.length ? `<dt>地区</dt><dd>${m.countries.map(escapeHtml).join(' / ')}</dd>` : ''}
                    ${m.languages.length ? `<dt>语言</dt><dd>${m.languages.map(escapeHtml).join(' / ')}</dd>` : ''}
                    ${m.runtime ? `<dt>片长</dt><dd>${escapeHtml(m.runtime)}</dd>` : ''}
                    ${directorGuess ? `<dt>导演</dt><dd>${escapeHtml(directorGuess)}</dd>` : ''}
                    ${actorsGuess ? `<dt>演员</dt><dd>${escapeHtml(actorsGuess)}</dd>` : ''}
                    ${m.mark_date ? `<dt>想看于</dt><dd>${escapeHtml(m.mark_date)}</dd>` : ''}
                </dl>
                <a class="m-link" href="${escapeAttr(m.url)}" target="_blank" rel="noopener">
                    在豆瓣查看 →
                </a>
            </div>
        `;
        els.modal.hidden = false;
    }

    function closeModal() { els.modal.hidden = true; }

    function guessDirector(m) {
        // intro_raw heuristic: directors usually appear once between actors and country/runtime
        // Here we just take the first 'people' entry that isn't an actor heuristically — fallback: omit.
        return '';
    }
    function guessActors(m) {
        if (!m.people || !m.people.length) return '';
        return m.people.slice(0, 5).join(' / ');
    }

    /* ─────────────────────── utils ──────────────────────────── */

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
