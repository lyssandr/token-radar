/* Token Radar dashboard: reads window.RADAR (data.js), renders board, live
   tab, model explainer and a detail view per protocol. No network, no fetch:
   every number on the page comes from the snapshot through lib/model.ts. */
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('app');
  var sortKey = 'rank', sortDir = 1;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageText(d) {
    if (d == null) return 'unknown';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }
  function bySlug(slug) {
    for (var i = 0; i < D.rows.length; i++) if (D.rows[i].slug === slug) return D.rows[i];
    return null;
  }

  /* Header stats, filled once. */
  (function stats() {
    var top = D.rows[0];
    var el = document.getElementById('stats');
    var items = [
      ['Snapshot', D.as_of],
      ['Watchlist', D.watchlist_size + ' protocols'],
      ['Board', D.board_size + ' ranked'],
      ['Floor', money(D.floor_usd)],
      ['Top implied value', top ? money(top.implied_value_usd) : '—'],
      ['Live tokens', D.live_size + ' shown apart']
    ];
    el.innerHTML = items.map(function (kv) {
      return '<div><dt>' + kv[0] + '</dt><dd>' + esc(kv[1]) + '</dd></div>';
    }).join('');
  })();

  function tabOn(id) {
    ['tab-board', 'tab-live', 'tab-model'].forEach(function (t) {
      document.getElementById(t).classList.toggle('on', t === id);
    });
  }

  /* ---------- Board ---------- */
  function parseHash() {
    var h = location.hash || '#/board';
    var parts = h.slice(2).split('?');
    var out = { view: parts[0] || 'board', q: {} };
    if (parts[1]) parts[1].split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) out.q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return out;
  }

  function boardHTML(f) {
    var cats = [], chains = [];
    D.rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
    });
    cats.sort(); chains.sort();
    function opts(list, sel, all) {
      return '<option value="">' + all + '</option>' + list.map(function (v) {
        return '<option' + (sel === v ? ' selected' : '') + '>' + esc(v) + '</option>';
      }).join('');
    }
    return '<section class="panel"><h2>Pre-token board</h2>' +
      '<p>Ranked by implied value, model radar-4. <span class="badge">Watchlist</span> marks the 40 protocols on the snapshot watchlist; the rest are the early finds below the $50M floor that pass the same no-token test — no wrapped, staked or bridged product. Every protocol here records no token.</p>' +
      '<div class="filters">' +
      '<label>Search<input id="f-q" type="search" placeholder="Name or slug" value="' + esc(f.q || '') + '"></label>' +
      '<label>Category<select id="f-cat">' + opts(cats, f.cat, 'All categories') + '</select></label>' +
      '<label>Chain<select id="f-chain">' + opts(chains, f.chain, 'All chains') + '</select></label>' +
      '<label>Min TVL<select id="f-mintvl">' + [['', 'Any TVL'], ['50000000', '$50M+'], ['100000000', '$100M+'], ['500000000', '$500M+'], ['1000000000', '$1B+']].map(function (o) {
        return '<option value="' + o[0] + '"' + (String(f.mintvl || '') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label>' +
      '<label class="check"><input id="f-watch" type="checkbox"' + (f.watch ? ' checked' : '') + '> Watchlist only</label>' +
      '</div><p><span class="count" id="f-count"></span></p></section>' +
      '<div class="panel" style="padding:0;overflow-x:auto"><table><thead><tr>' +
      '<th class="num"><button data-sort="rank">Rank</button></th>' +
      '<th><button data-sort="name">Protocol</button></th>' +
      '<th><button data-sort="category">Category</button></th>' +
      '<th>Chains</th>' +
      '<th class="num"><button data-sort="tvl_usd">TVL</button></th>' +
      '<th class="num"><button data-sort="change_7d">7d</button></th>' +
      '<th class="num"><button data-sort="age_days">Age</button></th>' +
      '<th class="num"><button data-sort="implied_value_usd">Implied value</button></th>' +
      '</tr></thead><tbody id="rows"></tbody></table></div>';
  }

  function filteredRows(f) {
    var q = (f.q || '').toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (f.watch && !r.watchlist) return false;
      if (f.cat && r.category !== f.cat) return false;
      if (f.chain && r.chains.indexOf(f.chain) < 0) return false;
      if (f.mintvl && r.tvl_usd < +f.mintvl) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var key = sortKey;
    rows.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av == null) return 1; if (bv == null) return -1;
      if (typeof av === 'string') return sortDir * (av < bv ? -1 : av > bv ? 1 : 0);
      return sortDir * (av - bv);
    });
    return rows;
  }

  function renderBoard(f) {
    tabOn('tab-board');
    app.innerHTML = boardHTML(f);
    var tbody = document.getElementById('rows');
    function draw() {
      var rows = filteredRows(f);
      document.getElementById('f-count').textContent =
        rows.length + ' of ' + D.rows.length + ' protocols — click a column to sort, click a name for its detail view.';
      tbody.innerHTML = rows.map(function (r) {
        return '<tr><td class="num">' + r.rank + '</td>' +
          '<td><a href="#/protocol/' + esc(r.slug) + '">' + esc(r.name) + '</a>' +
          (r.watchlist ? '<span class="badge">Watchlist</span>' : '') + '<br><span class="muted">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td>' +
          '<td>' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + ageText(r.age_days) + '</td>' +
          '<td class="num"><strong>' + money(r.implied_value_usd) + '</strong></td></tr>';
      }).join('') || '<tr><td colspan="8">No protocol matches these filters. Loosen one and try again.</td></tr>';
    }
    function syncHash() {
      var parts = [];
      if (f.q) parts.push('q=' + encodeURIComponent(f.q));
      if (f.cat) parts.push('cat=' + encodeURIComponent(f.cat));
      if (f.chain) parts.push('chain=' + encodeURIComponent(f.chain));
      if (f.watch) parts.push('watch=1');
      if (f.mintvl) parts.push('mintvl=' + f.mintvl);
      var h = '#/board' + (parts.length ? '?' + parts.join('&') : '');
      if (location.hash !== h) history.replaceState(null, '', h);
    }
    ['q', 'cat', 'chain', 'mintvl'].forEach(function (k) {
      var el = document.getElementById('f-' + k);
      el.addEventListener('input', function () { f[k] = el.value; draw(); syncHash(); });
      el.addEventListener('change', function () { f[k] = el.value; draw(); syncHash(); });
    });
    document.getElementById('f-watch').addEventListener('change', function (e) {
      f.watch = e.target.checked; draw(); syncHash();
    });
    app.querySelectorAll('th button').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === 'name' || k === 'category' ? 1 : -1; }
        draw();
      });
    });
    draw();
  }

  /* ---------- Live tokens ---------- */
  function renderLive() {
    tabOn('tab-live');
    app.innerHTML = '<section class="panel"><h2>Live tokens — already trading</h2>' +
      '<p>These protocols record a token, so they are <strong>not</strong> ranked on the pre-token board. The value shown is the market\u2019s own market cap from the snapshot, never a model value. The top ' + D.live.length + ' by market cap are listed; the full live set is in the snapshot.</p></section>' +
      '<div class="panel" style="padding:0;overflow-x:auto"><table><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead><tbody>' +
      D.live.map(function (r) {
        return '<tr><td><strong>' + esc(r.name) + '</strong><br><span class="muted">' + esc(r.slug) + '</span></td>' +
          '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 3).join(', ')) + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td><td class="num"><strong>' + money(r.mcap_usd) + '</strong></td>' +
          '<td class="num">' + pct(r.change_7d) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------- Model explainer ---------- */
  function renderModel() {
    tabOn('tab-model');
    var m = D.model;
    app.innerHTML = '<section class="panel"><h2>How the model works — radar-4</h2>' +
      '<p>One formula scores every protocol, from the snapshot\u2019s own figures only. No name is ever special-cased: two protocols with the same figures get the same value.</p>' +
      '<pre class="formula">' + esc(D.model_formula) + '</pre>' +
      '<table class="factors"><thead><tr><th>Factor</th><th>What it is</th><th>Range</th></tr></thead><tbody>' +
      '<tr><td>Base</td><td>TVL x ' + m.base_multiple + ' — size is the anchor: a bigger protocol supports a bigger launch.</td><td>TVL x 0.25</td></tr>' +
      '<tr><td>Growth</td><td>7-day TVL change, clamped to ' + m.growth_floor + '% .. +' + m.growth_cap + '%, weighted ' + m.growth_weight + ' — momentum, capped so one wild week cannot dominate.</td><td>' + (1 + m.growth_floor / 100 * m.growth_weight).toFixed(2) + ' – ' + (1 + m.growth_cap / 100 * m.growth_weight).toFixed(2) + '</td></tr>' +
      '<tr><td>Maturity</td><td>Age from listed_at to ' + esc(D.as_of) + ' (365 days when unlisted), capped at ' + m.maturity_days + ' days — surviving longer with no token earns trust, up to a point.</td><td>' + m.maturity_floor + ' – ' + (m.maturity_floor + m.maturity_range).toFixed(1) + '</td></tr>' +
      '<tr><td>Chain spread</td><td>1% per extra chain beyond the first, capped at +' + (m.chain_max_extra * m.chain_step * 100) + '% — wider distribution means more places a launch can land. Added in radar-2, deliberately small so it breaks near-ties but never outranks TVL.</td><td>1.00 – 1.09</td></tr>' +
      '<tr><td>Category lead</td><td>Share of the protocol\u2019s own category TVL, capped at ' + (m.dominance_cap * 100) + '% share and weighted ' + m.dominance_weight + ', only when the category holds ' + m.dominance_min_category + ' or more protocols in the snapshot — a category flagship is the most likely launch candidate in its category. Added in radar-4, deliberately small so it rewards a real lead but never outranks TVL.</td><td>1.00 – 1.05</td></tr>' +
      '</tbody></table>' +
      '<p>Ties that remain break by TVL, then by slug, so the order is fully deterministic. The board ranks ' + D.board_size + ' protocols: all ' + D.watchlist_size + ' on the watchlist plus ' + D.early_size + ' early pre-token protocols below the ' + money(D.floor_usd) + ' floor. Live-token protocols are excluded from ranking and shown at market cap instead.</p>' +
      '<p>This is not a TVL table: ' + D.rank_moved_5plus + ' of the ' + D.board_size + ' rows sit 5 or more places from where TVL alone would put them, because growth, age, chain spread and category lead move the order. radar-4 adds the category-lead factor to the radar-3 formula; it moves 14 of ' + D.board_size + ' ranks and none of the top 5.</p>' +
      '<p>Who is left out, and why. A wrapped, staked or bridged product of a token that already trades is not a protocol still waiting on a launch, so the watchlist\u2019s own test applies to every row, not just the watchlist: ' + D.excluded_visible + ' pre-token protocols are left out by that test (centralised exchanges, bridges, liquid staking and restaking, versioned pools, wrapped or staked names, exchange products). ' + D.excluded_house + ' more are left out only by the watchlist itself: the house sees each protocol\u2019s parent protocol, which this snapshot does not carry, so above the floor the watchlist is authoritative.</p>' +
      '<p>Farm plans are built per category from the same figures: capital tiers follow TVL ($50 / $100 / $150 / $250), the hold window follows age (60 / 45 / 30 days), the actions follow the category and the chains, and step 5 is a risk check written from the protocol\u2019s own 7-day change, age, chain count and TVL — a sharp fall, a steady fall, a surge, a long wait, a young protocol, a slow drift, a single-chain position, a thin TVL, missing momentum data, a wide chain spread, or a steady state that still names its own figures. ' + D.generic_risk_steps + ' of the ' + D.board_size + ' risk steps are generic.</p></section>';
  }

  /* ---------- Detail view ---------- */
  function renderDetail(slug) {
    var r = bySlug(slug);
    tabOn('tab-board');
    if (!r) {
      app.innerHTML = '<section class="panel"><h2>Protocol not found</h2><p>No ranked protocol has the slug \u201c' + esc(slug) + '\u201d. It may record a token already, or sit outside this snapshot.</p><p><a class="back" href="#/board">&larr; Back to the board</a></p></section>';
      return;
    }
    var mo = r.model;
    var share = function (label, value, note) {
      return '<tr><td>' + label + '</td><td class="num">' + value + '</td><td>' + note + '</td></tr>';
    };
    app.innerHTML = '<section class="panel detail"><a class="back" href="#/board">&larr; Back to the board</a>' +
      '<h2>#' + r.rank + ' &nbsp;' + esc(r.name) + (r.watchlist ? '<span class="badge">Watchlist</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'No category') + ' &middot; ' + esc(r.chains.join(', ')) + ' &middot; records no token</p>' +
      '<dl class="grid">' +
      '<div><dt>Implied value</dt><dd>' + money(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>' +
      '<div><dt>7-day change</dt><dd>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') + '</dd></div>' +
      '<div><dt>Age</dt><dd>' + ageText(r.age_days) + '</dd></div>' +
      '<div><dt>Listed</dt><dd>' + esc(r.listed_at || 'unknown') + '</dd></div>' +
      '<div><dt>Chains</dt><dd>' + mo.chain_count + '</dd></div></dl>' +
      '<div class="detail-cols"><div>' +
      '<h2>Model breakdown — radar-4</h2>' +
      '<table class="factors"><thead><tr><th>Factor</th><th class="num">Value</th><th>How it was computed</th></tr></thead><tbody>' +
      share('Base', money(mo.base_usd), 'TVL ' + money(r.tvl_usd) + ' x 0.25') +
      share('Growth', 'x' + mo.growth_multiplier, '7-day change ' + (r.change_7d == null ? 'unreported (0%)' : r.change_7d.toFixed(2) + '%') + ', clamped to -60% .. +120%') +
      share('Maturity', 'x' + mo.maturity_multiplier, 'age ' + (mo.age_days == null ? 'unknown, counted as 365 days' : mo.age_days + ' days') + ', capped at 1,095 days') +
      share('Chain spread', 'x' + mo.chain_multiplier, mo.chain_count + ' chain' + (mo.chain_count === 1 ? '' : 's') + ' — 1% per extra chain, capped at +9%') +
      share('Category lead', 'x' + mo.dominance_multiplier, (mo.category_share * 100).toFixed(1) + '% of ' + esc(r.category || 'its category') + ' TVL (' + mo.category_size + ' protocols) — capped at 50% share, only when the category holds 3+ protocols') +
      share('Implied value', money(r.implied_value_usd), 'base x growth x maturity x chain spread x category lead, rounded to the dollar') +
      '</tbody></table>' +
      '</div><div>' +
      '<h2>Farm plan — 7 steps</h2>' +
      '<p>Concrete steps for this protocol, from its category, chains, TVL, age and 7-day change. Each step states what it costs and how long it takes; step 5 is the risk check for this protocol alone.</p>' +
      '<ol class="farm">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '</div></div>' +
      '<p class="muted">Snapshot figures: TVL ' + money(r.tvl_usd) + ', 7-day change ' + (r.change_7d == null ? 'unreported' : r.change_7d + '%') + ', listed ' + esc(r.listed_at || 'unknown') + ', snapshot date ' + esc(D.as_of) + '.</p></section>';
  }

  function route() {
    var h = parseHash();
    if (h.view === 'live') renderLive();
    else if (h.view === 'model') renderModel();
    else if (h.view.indexOf('protocol/') === 0) renderDetail(decodeURIComponent(h.view.slice(9)));
    else renderBoard({ q: h.q.q || '', cat: h.q.cat || '', chain: h.q.chain || '', watch: h.q.watch === '1', mintvl: h.q.mintvl || '' });
  }
  window.addEventListener('hashchange', route);
  route();
})();
