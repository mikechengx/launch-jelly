/* Launch Jelly locale runtime. UI strings only; task data and field values are never traversed. */
(() => {
  'use strict';
  const translations = __TRANSLATIONS__;
  const key = 'launch-jelly.lang';
  let saved = null;
  try { saved = localStorage.getItem(key); } catch (_) {}
  const requested = new URLSearchParams(location.search).get('lang');
  let language = ['zh', 'en'].includes(requested) ? requested : ['zh', 'en'].includes(saved) ? saved : 'zh';
  const texts = [], attributes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('script,style,textarea,option,[data-user-content]')) continue;
    if (Object.hasOwn(translations, node.textContent.trim())) texts.push([node, node.textContent]);
  }
  for (const node of document.querySelectorAll('[aria-label],[placeholder],[title]')) {
    if (node.closest('[data-user-content]')) continue;
    const values = {};
    for (const attr of ['aria-label', 'placeholder', 'title']) {
      const value = node.getAttribute(attr);
      if (value !== null && Object.hasOwn(translations, value)) values[attr] = value;
    }
    if (Object.keys(values).length) {
      // Preserve source metadata when the renderer replaces its canvas with a clone.
      node.dataset.ljI18nAttrs = JSON.stringify(values);
      attributes.push(node);
    }
  }
  function t(text) {
    if (language !== 'en' || typeof text !== 'string') return text;
    return Object.hasOwn(translations, text) ? translations[text] : text;
  }
  function paint() {
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.title = 'Launch Jelly';
    for (const [node, original] of texts) {
      if (!node.isConnected) continue;
      const trimmed = original.trim(), translated = t(trimmed);
      node.textContent = original.replace(trimmed, translated);
    }
    for (const node of document.querySelectorAll('[data-lj-i18n-attrs]')) {
      const source = JSON.parse(node.dataset.ljI18nAttrs);
      for (const [name, text] of Object.entries(source)) node.setAttribute(name, t(text));
    }
    for (const button of document.querySelectorAll('.language-switch [data-lang]')) {
      const selected = button.dataset.lang === language;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('active', selected);
    }
    document.documentElement.style.setProperty('--sound-word', language === 'en' ? '"Sound"' : '"声音"');
  }
  const api = {
    get language() { return language; },
    t,
    setLanguage(next) {
      if (!['zh', 'en'].includes(next)) return;
      language = next;
      try { localStorage.setItem(key, language); } catch (_) {}
      // The query parameter chooses the initial language; keep shared links in sync after switching.
      try { const url = new URL(location.href); url.searchParams.set('lang', next); history.replaceState(null, '', url); } catch (_) {}
      paint();
      api.onChange?.();
      window.dispatchEvent(new CustomEvent('launch-jelly:language', { detail: { language } }));
    },
    refresh: paint,
    onChange: null,
    translatedKeys: Object.keys(translations).length,
  };
  window.JellyLocale = api;
  for (const button of document.querySelectorAll('.language-switch [data-lang]')) {
    button.addEventListener('click', () => api.setLanguage(button.dataset.lang));
  }
  paint();
})();
function JLT(text) { return window.JellyLocale.t(text); }
