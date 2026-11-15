/*
 * WebMCP для zoo-rus.ru (статический сайт без форм).
 * Три read-only инструмента для браузерных ИИ-агентов:
 *   1) search_articles: поиск страниц сайта по словам, категории и типу (каталог /ai-catalog.json);
 *   2) get_article_details: метаданные одной страницы по slug;
 *   3) get_contact_info: контакты и график организаций Месягутово (справочно) и контакты владельца.
 * WebMCP это черновик стандарта: если браузер его не поддерживает, скрипт молча ничего не делает.
 * Контакты, категории и типы подставляются при сборке из data/*.json и страниц сайта.
 */
(function () {
  'use strict';

  var mc = (typeof document !== 'undefined' && document.modelContext) ||
           (typeof navigator !== 'undefined' && navigator.modelContext);
  if (!mc) return;

  var CONTACTS = /*CONTACTS*/null;
  var CATEGORIES = /*CATEGORIES*/[];
  var TYPES = /*TYPES*/[];
  var cache = null;

  function text(value) {
    return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
  }

  // Адреса строим от корня сайта, чтобы скрипт работал на любой вложенной странице
  function abs(path) { return new URL(path, location.origin).href; }

  function loadArticles() {
    if (cache) return Promise.resolve(cache);
    return fetch(abs('/ai-catalog.json'), { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (catalog) {
        var list = [];
        (catalog.categories || []).forEach(function (cat) {
          (cat.articles || []).forEach(function (a) {
            list.push({ slug: a.slug, title: a.title, url: a.url, category: cat.title, type: a.type || 'info', keywords: a.keywords || [] });
          });
        });
        cache = list;
        return list;
      })
      .catch(function () { return []; });
  }

  var searchArticles = {
    name: 'search_articles',
    description: 'Поиск страниц на сайте Зоо-Месягутово (справочник по ветеринарии Месягутово и Дуванского района): организации, соседние районы, анонсы услуг, статьи, новости. Возвращает до 10 страниц с названием, адресом и категорией.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Слова для поиска: «ветстанция», «Сатка», «УЗИ», «аптека», «Уфа»' },
        category: { type: 'string', enum: CATEGORIES, description: 'Фильтр по категории' },
        type: { type: 'string', enum: TYPES, description: 'Тип страницы' }
      }
    },
    annotations: { readOnlyHint: true },
    execute: function (input) {
      input = input || {};
      var query = String(input.query || '').toLowerCase();
      var category = String(input.category || '').toLowerCase();
      var type = String(input.type || '').toLowerCase();
      var words = query.split(/\s+/).filter(Boolean);
      return loadArticles().then(function (list) {
        var found = list.filter(function (a) {
          if (category && String(a.category).toLowerCase() !== category) return false;
          if (type && String(a.type).toLowerCase() !== type) return false;
          if (!words.length) return true;
          var hay = (a.title + ' ' + (a.keywords || []).join(' ')).toLowerCase();
          return words.every(function (w) { return hay.indexOf(w) !== -1; });
        }).slice(0, 10);
        if (!found.length) return text('Ничего не найдено. Полный список страниц: ' + abs('/sitemap.xml'));
        return text(found.map(function (a) { return { title: a.title, url: a.url, category: a.category, slug: a.slug, keywords: a.keywords }; }));
      });
    }
  };

  var getArticleDetails = {
    name: 'get_article_details',
    description: 'Метаданные одной страницы сайта: название, адрес, категория, тип и ключевые слова. Идентификатор (slug) можно получить через search_articles.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Идентификатор страницы, например «duvanskaya-veterinarnaya-stanciya» или «sosednie-rayony»' } },
      required: ['slug']
    },
    annotations: { readOnlyHint: true },
    execute: function (input) {
      var slug = String((input && input.slug) || '').toLowerCase().trim();
      return loadArticles().then(function (list) {
        var a = list.filter(function (x) { return x.slug === slug; })[0];
        if (!a) return text('Страница «' + slug + '» не найдена.');
        return text({ slug: a.slug, title: a.title, url: a.url, category: a.category, type: a.type, keywords: a.keywords });
      });
    }
  };

  var getContactInfo = {
    name: 'get_contact_info',
    description: 'Контакты и график организаций Месягутово (справочно, сайт неофициальный) и контакты владельца сайта. Данные нужно уточнять по телефону.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () { return text(CONTACTS); }
  };

  var tools = [searchArticles, getArticleDetails, getContactInfo];

  tools.forEach(function (tool) {
    try {
      if (typeof mc.registerTool === 'function') {
        var r = mc.registerTool(tool);
        if (r && typeof r.catch === 'function') r.catch(function () {});
      }
    } catch (e) { /* уже зарегистрирован или запрещено политикой браузера */ }
  });

  if (typeof mc.registerTool !== 'function' && typeof mc.provideContext === 'function') {
    try { mc.provideContext({ tools: tools }); } catch (e) {}
  }
})();
