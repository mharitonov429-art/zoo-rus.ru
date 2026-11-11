/*
 * WebMCP для zoo-rus.ru (статический сайт без форм).
 * Два read-only инструмента для браузерных ИИ-агентов:
 *   1) search_articles: поиск по страницам сайта (читает /search-index.json);
 *   2) get_contacts: контакты и график организаций Месягутово (справочно).
 * WebMCP это черновик стандарта: без поддержки в браузере скрипт ничего не делает.
 * Данные контактов подставляются при сборке из data/*.json.
 */
(function () {
  'use strict';

  var mc = (typeof document !== 'undefined' && document.modelContext) ||
           (typeof navigator !== 'undefined' && navigator.modelContext);
  if (!mc) return;

  var CONTACTS = /*CONTACTS*/null;
  var cache = null;

  function text(value) {
    return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] };
  }

  function loadIndex() {
    if (!cache) {
      cache = fetch('/search-index.json', { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }
    return cache;
  }

  var searchArticles = {
    name: 'search_articles',
    description: 'Поиск по страницам сайта Зоо-Месягутово (zoo-rus.ru) по ключевым словам: организации, услуги, статьи, новости. Возвращает до 10 страниц со ссылкой и кратким описанием.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Слова для поиска, например «ветстанция», «Сатка», «УЗИ»' }
      },
      required: ['query']
    },
    annotations: { readOnlyHint: true },
    execute: function (input) {
      var words = String((input && input.query) || '').toLowerCase().split(/\s+/).filter(Boolean);
      return loadIndex().then(function (all) {
        var found = all.filter(function (item) {
          var hay = ((item.title || '') + ' ' + (item.summary || '') + ' ' + (item.url || '')).toLowerCase();
          return words.every(function (w) { return hay.indexOf(w) !== -1; });
        }).slice(0, 10);
        return text(found.length ? found : 'Ничего не найдено. Полный список страниц: ' + new URL('/sitemap.xml', location.origin).href);
      });
    }
  };

  var getContacts = {
    name: 'get_contacts',
    description: 'Контакты и график организаций Месягутово (справочно, сайт неофициальный) и контакты владельца сайта. Данные нужно уточнять по телефону.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () { return text(CONTACTS); }
  };

  [searchArticles, getContacts].forEach(function (tool) {
    try {
      if (typeof mc.registerTool === 'function') {
        var r = mc.registerTool(tool);
        if (r && typeof r.catch === 'function') r.catch(function () {});
      }
    } catch (e) { /* уже зарегистрирован или запрещено политикой браузера */ }
  });

  if (typeof mc.registerTool !== 'function' && typeof mc.provideContext === 'function') {
    try { mc.provideContext({ tools: [searchArticles, getContacts] }); } catch (e) {}
  }
})();
