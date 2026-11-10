/* From “Home” to Home. Plain browser JavaScript; no backend or build step. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const GROUPS = ['eat', 'go', 'plans'];
  const STORAGE_KEY = 'america-trip-list-v2';
  const OLD_STORAGE_KEY = 'america-trip-checks';
  const defaults = {};
  for (const group of GROUPS) {
    defaults[group] = [...document.querySelectorAll(`#${group} .tasks input[data-id]`)].map(input => ({
      id: input.dataset.id,
      text: input.closest('label').querySelector('span').textContent.trim()
    }));
  }

  const empty = () => ({ checks: {}, additions: { eat: [], go: [], plans: [] }, edits: {}, removed: [] });
  let state = loadState();
  let currentEdit = null;
  let toastTimer = null;

  restoreSharedSnapshot();
  setupCountdown();
  setupLists();
  renderAll();
  window.addEventListener('pageshow', event => {
    if (event.persisted) { state = loadState(); renderAll(); }
  });

  function storageRead(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* works in-memory if storage is blocked */ }
  }
  function sanitize(raw) {
    const safe = empty();
    if (!raw || typeof raw !== 'object') return safe;
    if (raw.checks && typeof raw.checks === 'object') {
      for (const [id, checked] of Object.entries(raw.checks).slice(0, 500)) {
        if (typeof id === 'string' && id.length < 100 && checked === true) safe.checks[id] = true;
      }
    }
    if (raw.edits && typeof raw.edits === 'object') {
      for (const [id, label] of Object.entries(raw.edits).slice(0, 500)) {
        if (typeof id === 'string' && id.length < 100 && typeof label === 'string' && label.trim()) safe.edits[id] = label.trim().slice(0, 90);
      }
    }
    if (Array.isArray(raw.removed)) {
      safe.removed = raw.removed.filter(id => typeof id === 'string' && id.length < 100).slice(0, 500);
    }
    for (const group of GROUPS) {
      const list = raw.additions && raw.additions[group];
      if (Array.isArray(list)) safe.additions[group] = list.filter(item => item && typeof item.id === 'string' && item.id.length < 100 && typeof item.text === 'string' && item.text.trim()).slice(0, 200).map(item => ({ id: item.id, text: item.text.trim().slice(0, 90) }));
    }
    return safe;
  }
  function loadState() {
    const current = storageRead(STORAGE_KEY);
    if (current) {
      try { return sanitize(JSON.parse(current)); } catch (_) { return empty(); }
    }
    const fresh = empty();
    try {
      const previous = JSON.parse(storageRead(OLD_STORAGE_KEY) || '{}');
      if (previous && typeof previous === 'object') {
        Object.entries(previous).forEach(([id, checked]) => { if (checked) fresh.checks[id] = true; });
      }
    } catch (_) { /* nothing to migrate */ }
    return fresh;
  }
  function findItem(group, id) {
    const builtIn = defaults[group].find(item => item.id === id);
    const custom = state.additions[group].find(item => item.id === id);
    const original = builtIn || custom;
    return original ? { id, text: state.edits[id] || original.text, custom: Boolean(custom) } : null;
  }
  function visibleItems(group) {
    return [...defaults[group], ...state.additions[group]]
      .filter(item => !state.removed.includes(item.id))
      .map(item => ({ ...item, text: state.edits[item.id] || item.text }));
  }
  function renderAll() {
    GROUPS.forEach(renderGroup);
    updateProgress();
  }
  function renderGroup(group) {
    const list = document.querySelector(`[data-list="${group}"]`);
    if (!list) return;
    const fragment = document.createDocumentFragment();
    for (const item of visibleItems(group)) {
      const li = document.createElement('li');
      li.className = 'task-row';
      const label = document.createElement('label');
      label.className = 'task';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.dataset.id = item.id;
      check.dataset.group = group;
      check.checked = Boolean(state.checks[item.id]);
      check.autocomplete = 'off';
      const name = document.createElement('span');
      name.className = 'task-label';
      name.textContent = item.text;
      label.append(check, name);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'item-edit';
      edit.dataset.editItem = item.id;
      edit.dataset.group = group;
      edit.setAttribute('aria-label', `${item.text}を編集`);
      edit.textContent = '編集';
      li.append(label, edit);
      fragment.append(li);
    }
    list.replaceChildren(fragment);
  }
  function updateProgress() {
    let total = 0;
    let done = 0;
    for (const group of GROUPS) {
      const items = visibleItems(group);
      const count = items.filter(item => state.checks[item.id]).length;
      total += items.length;
      done += count;
      const indicator = document.querySelector(`[data-progress="${group}"]`);
      const bar = document.querySelector(`[data-bar="${group}"]`);
      if (indicator) indicator.textContent = `${count}/${items.length}`;
      if (bar) bar.style.width = items.length ? `${count / items.length * 100}%` : '0%';
    }
    $('overall-count').textContent = `${done} / ${total}`;
    $('overall-fill').style.width = total ? `${done / total * 100}%` : '0%';
    $('overall-progress').setAttribute('aria-valuemax', String(total));
    $('overall-progress').setAttribute('aria-valuenow', String(done));
  }
  function setupLists() {
    for (const group of GROUPS) {
      const section = $(group);
      const list = section.querySelector('.tasks');
      list.addEventListener('change', event => {
        const input = event.target.closest('input[data-id]');
        if (!input) return;
        if (input.checked) state.checks[input.dataset.id] = true;
        else delete state.checks[input.dataset.id];
        save();
        updateProgress();
      });
      list.addEventListener('click', event => {
        const edit = event.target.closest('button[data-edit-item]');
        if (edit) openEditor(edit.dataset.group, edit.dataset.editItem);
      });
      const form = section.querySelector('[data-add-form]');
      const field = form.querySelector('input');
      const addButton = section.querySelector('[data-add]');
      addButton.addEventListener('click', () => {
        form.hidden = false;
        addButton.hidden = true;
        field.focus();
      });
      section.querySelector('[data-cancel-add]').addEventListener('click', () => closeForm());
      form.addEventListener('submit', event => {
        event.preventDefault();
        const value = field.value.trim();
        if (!value) return;
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        state.additions[group].push({ id, text: value.slice(0, 90) });
        save();
        renderGroup(group);
        updateProgress();
        closeForm();
        toast('追加したよ');
      });
      function closeForm() {
        form.hidden = true;
        addButton.hidden = false;
        form.reset();
      }
      section.querySelector('[data-editmode]').addEventListener('click', event => {
        const active = section.classList.toggle('is-editing');
        event.currentTarget.textContent = active ? '完了' : '編集';
        event.currentTarget.setAttribute('aria-pressed', String(active));
      });
    }
    $('edit-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!currentEdit) return;
      const text = $('edit-text').value.trim().slice(0, 90);
      if (!text) return;
      const { group, id } = currentEdit;
      const custom = state.additions[group].find(item => item.id === id);
      if (custom) custom.text = text;
      else state.edits[id] = text;
      save();
      renderGroup(group);
      updateProgress();
      $('edit-dialog').close();
      toast('保存したよ');
    });
    $('dialog-close').addEventListener('click', () => $('edit-dialog').close());
    $('delete-task').addEventListener('click', () => {
      if (!currentEdit || !window.confirm('この項目をけす？')) return;
      const { group, id } = currentEdit;
      state.additions[group] = state.additions[group].filter(item => item.id !== id);
      if (defaults[group].some(item => item.id === id)) state.removed.push(id);
      delete state.checks[id];
      delete state.edits[id];
      save();
      renderGroup(group);
      updateProgress();
      $('edit-dialog').close();
      toast('けしたよ');
    });
    $('reset-checks').addEventListener('click', () => {
      if (!window.confirm('リセットする？追加とチェックが消えるよ。')) return;
      state = empty();
      save();
      renderAll();
      toast('リセットしたよ');
    });
    $('share-list').addEventListener('click', shareSnapshot);
  }
  function openEditor(group, id) {
    const item = findItem(group, id);
    if (!item) return;
    currentEdit = { group, id };
    $('edit-text').value = item.text;
    const dialog = $('edit-dialog');
    dialog.showModal();
    $('edit-text').focus();
    $('edit-text').select();
  }
  function toast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove('show'), 2800);
  }
  function toBase64Url(object) {
    const bytes = new TextEncoder().encode(JSON.stringify(object));
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  function fromBase64Url(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, char => char.charCodeAt(0))));
  }
  async function shareSnapshot() {
    const url = window.location.href.split('#')[0] + '#list=' + toBase64Url(state);
    if (navigator.share && /^https?:/.test(location.protocol)) {
      try {
        await navigator.share({ title: 'やること', text: 'いっしょにやること', url });
        return;
      } catch (error) { if (error && error.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('リンクをコピーしたよ');
    } catch (_) {
      window.prompt('このリンクをコピーしてね', url);
    }
  }
  function restoreSharedSnapshot() {
    const hash = window.location.hash;
    if (!hash.startsWith('#list=')) return;
    try {
      if (hash.length > 16000) throw new Error('Too long');
      const imported = sanitize(fromBase64Url(hash.slice(6)));
      const hasLocal = Boolean(storageRead(STORAGE_KEY));
      if (!hasLocal || window.confirm('このリストを読み込む？この端末のリストと入れかわるよ。')) {
        state = imported;
        save();
        setTimeout(() => toast('リストが届いたよ'), 100);
      }
    } catch (_) {
      setTimeout(() => toast('リンクを開けなかったよ'), 100);
    }
    history.replaceState(null, '', window.location.pathname + window.location.search + '#list');
  }
  // A wall-clock arrival in Maine is converted to an actual UTC instant,
  // including daylight saving time. The countdown is correct in Japan too.
  function setupCountdown() {
    const trip = window.TRIP || {};
    const arrivalZone = trip.arrivalZone || 'America/New_York';
    const target = wallTime(trip.arrival, arrivalZone);
    const preview = $('preview-note');
    if (preview) preview.hidden = Boolean(trip.dateConfirmed);
    if (Number.isNaN(target.getTime())) {
      $('status').textContent = '日付がまだないよ';
      $('big-num').textContent = '?';
      $('big-unit').textContent = '日後';
      return;
    }
    const format = (date, zone, suffix) => {
      const day = new Intl.DateTimeFormat('en-US', { timeZone:zone, month:'short', day:'numeric' }).format(date);
      const clock = new Intl.DateTimeFormat('en-US', { timeZone:zone, hour:'numeric', minute:'2-digit' }).format(date);
      return `${day} · ${clock} ${suffix}`;
    };
    const zoneName = new Intl.DateTimeFormat('en-US', { timeZone: arrivalZone, timeZoneName: 'short' }).formatToParts(target).find(part => part.type === 'timeZoneName');
    $('arrives').textContent = format(target, arrivalZone, trip.arrivalLabel || (zoneName && zoneName.value) || 'ET');
    let lastMinute = -1;
    let timer = null;
    const root = $('countdown');
    function tick() {
      const secondsLeft = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
      if (secondsLeft <= 0) {
        root.hidden = true;
        $('arrived').hidden = false;
        $('status').textContent = 'ここにいるね';
        $('live').textContent = '会えたね。まってたよ。';
        $('live').setAttribute('aria-live', 'polite');
        clearInterval(timer);
        return;
      }
      const days = Math.floor(secondsLeft / 86400);
      const hours = Math.floor(secondsLeft % 86400 / 3600);
      const mins = Math.floor(secondsLeft % 3600 / 60);
      const secs = secondsLeft % 60;
      $('big-num').textContent = String(days);
      $('big-unit').textContent = '日後';
      $('hh').textContent = String(hours).padStart(2, '0');
      $('mm').textContent = String(mins).padStart(2, '0');
      $('ss').textContent = String(secs).padStart(2, '0');
      const spoken = `あと${days}日${hours}時間${mins}分`;
      root.setAttribute('aria-label', spoken);
      if (mins !== lastMinute) {
        $('live').textContent = spoken;
        lastMinute = mins;
      }
    }
    tick();
    if (!$('countdown').hidden) timer = setInterval(tick, 1000);
  }
  function wallTime(raw, timeZone) {
    if (!raw) return new Date(NaN);
    if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) return new Date(raw);
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw);
    if (!match) return new Date(NaN);
    const guess = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]));
    const first = guess.getTime() - zoneOffset(guess, timeZone);
    return new Date(guess.getTime() - zoneOffset(new Date(first), timeZone));
  }
  function zoneOffset(date, zone) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone:zone, hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' }).formatToParts(date);
    const map = {};
    parts.forEach(part => map[part.type] = part.value);
    return Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second) - date.getTime();
  }
})();
