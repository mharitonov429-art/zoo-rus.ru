// Генератор статического сайта «Зоо-Месягутово». Без зависимостей: только Node.js >= 18.
// Запуск: node build.mjs            (обычная сборка)
//         node build.mjs --rotate   (сдвиг блока ротации ссылок на главной; делает GitHub Actions раз в сутки)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, fmtDate, front } from './lib/util.mjs';
import buildPages from './content/pages.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const ROTATE = process.argv.includes('--rotate');
const PER_SECTION = 10;
const SECTIONS = ['Организации и услуги', 'Рядом с Месягутово', 'Витрина и объявления', 'Статьи', 'Новости'];

const site = readJson('data/site.json');
const warnings = [];

// ---------- загрузка Markdown (статьи и новости) ----------
function loadMd(dir, required) {
  const d = path.join(ROOT, dir);
  return fs.readdirSync(d)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const { meta, body } = front(fs.readFileSync(path.join(d, f), 'utf8'));
      for (const k of required) if (!meta[k]) throw new Error(`${dir}/${f}: нет поля «${k}» в шапке файла`);
      return { ...meta, slug: f.replace(/\.md$/, ''), body };
    });
}

const pages = buildPages({
  site,
  orgs: readJson('data/organizations.json'),
  neighbors: readJson('data/neighbors.json'),
  big: readJson('data/big-clinics.json'),
  products: readJson('data/products.json'),
  poultry: readJson('data/poultry-sellers.json'),
  articles: loadMd('content/stati', ['title', 'description', 'date', 'category']),
  news: loadMd('content/novosti', ['title', 'description', 'date']),
});

// ---------- общие значения по умолчанию ----------
const CRUMB = {
  '/organizacii/': 'Организации', '/uslugi/': 'Услуги', '/sosednie-rayony/': 'Соседние районы', '/krupnye-kliniki-rb/': 'Клиники Уфы',
  '/novosti/': 'Новости', '/stati/': 'Статьи', '/investoram/': 'Инвесторам', '/ptica/prodavcy/': 'Продавцы птицы',
  '/uslugi/uzi-zhivotnym/': 'УЗИ животным', '/uslugi/rentgen-zhivotnym/': 'Рентген животным', '/uslugi/laboratoriya-zhivotnym/': 'Собственная лаборатория',
  '/organizacii/duvanskaya-veterinarnaya-stanciya/': 'Дуванская ветстанция', '/organizacii/aravet-veterinarnaya-apteka/': 'Ветаптека АраВет',
  '/catalog/tovary-dlya-koshek/': 'Товары для кошек', '/o-proekte/': 'О проекте', '/kontakty/': 'Контакты', '/avtory/': 'Авторы и экспертиза',
  '/politika-konfidencialnosti/': 'Политика конфиденциальности',
};
for (const p of pages) {
  p.published ||= site.published;
  p.updated ||= site.verified;
  p.crumb = CRUMB[p.url] || p.h1;
  p.summary ||= p.description;
}
const newest = (kind) => pages.filter((p) => p.kind === kind).map((p) => p.updated).sort().pop();
for (const [url, kind] of [['/novosti/', 'news'], ['/stati/', 'article']]) {
  const hub = pages.find((p) => p.url === url);
  const n = newest(kind);
  if (hub && n) hub.updated = n;
}
const indexable = pages.filter((p) => !p.noindex);

// ---------- ротация ссылок на главной ----------
const stateFile = path.join(ROOT, 'data/rotation-state.json');
const stateBefore = fs.readFileSync(stateFile, 'utf8');
const state = JSON.parse(stateBefore);
const pool = indexable.filter((p) => p.section && p.url !== '/');
const rotationHtml = [];
for (const sec of SECTIONS) {
  const items = pool.filter((p) => p.section === sec);
  if (!items.length) { delete state[sec]; continue; }
  const urls = items.map((p) => p.url);
  let q = (state[sec] || []).filter((u) => urls.includes(u));
  q = [...urls.filter((u) => !q.includes(u)), ...q]; // новые страницы встают первыми
  if (ROTATE && q.length > PER_SECTION) q = [...q.slice(PER_SECTION), ...q.slice(0, PER_SECTION)]; // показанные уходят в конец
  state[sec] = q;
  const byUrl = Object.fromEntries(items.map((p) => [p.url, p]));
  rotationHtml.push(`<div><h3>${esc(sec)}</h3><ul>${q.slice(0, PER_SECTION).map((u) => `<li><a href="${u}">${esc(byUrl[u].h1)}</a></li>`).join('')}</ul></div>`);
}
for (const k of Object.keys(state)) if (!SECTIONS.includes(k)) delete state[k];
const stateAfter = JSON.stringify(state, null, 2) + '\n';
if (stateAfter !== stateBefore) fs.writeFileSync(stateFile, stateAfter);

// ---------- Яндекс Метрика (код владельца, без изменений) ----------
const ID = site.metrikaId;
const METRIKA = `<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){
        m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${ID}', 'ym');

    ym(${ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
</script>
<!-- /Yandex.Metrika counter -->`;
const METRIKA_NOSCRIPT = `<noscript><div><img src="https://mc.yandex.ru/watch/${ID}" style="position:absolute; left:-9999px;" alt="" /></div></noscript>`;

const CSS = fs.readFileSync(path.join(ROOT, 'lib/style.css'), 'utf8').replace(/\n+/g, '\n').trim();

const INLINE_JS = `(function(){document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[data-goal]');if(a&&typeof ym==='function'){ym(${ID},'reachGoal',a.getAttribute('data-goal'));}});try{var c=document.getElementById('cookie');if(c&&!localStorage.getItem('cookie-ok')){c.hidden=false;c.querySelector('button').onclick=function(){localStorage.setItem('cookie-ok','1');c.hidden=true;};}}catch(e){}})();`;

// ---------- JSON-LD ----------
const owner = { '@type': 'Person', '@id': `${site.domain}/#owner`, name: site.owner.name, jobTitle: site.owner.role, email: site.owner.email, telephone: site.owner.phone.replace(/\s/g, '') };
const clean = (o) => JSON.parse(JSON.stringify(o)); // убирает undefined

function graph(p) {
  const url = site.domain + p.url;
  const g = [owner];
  if (p.url === '/') g.push({ '@type': 'WebSite', '@id': `${site.domain}/#website`, url: `${site.domain}/`, name: site.name, inLanguage: 'ru-RU', publisher: { '@id': owner['@id'] } });
  if (p.url !== '/') {
    const trail = [['Главная', '/'], ...(p.crumbs || []), [p.crumb, p.url]];
    g.push({ '@type': 'BreadcrumbList', itemListElement: trail.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, ...(i < trail.length - 1 ? { item: site.domain + u } : {}) })) });
  }
  if (p.kind === 'article' || p.kind === 'news') {
    g.push({ '@type': p.kind === 'news' ? 'NewsArticle' : 'Article', headline: p.h1, datePublished: p.published, dateModified: p.updated, inLanguage: 'ru-RU', author: { '@type': 'Person', name: site.owner.name, url: `${site.domain}/avtory/` }, publisher: { '@id': owner['@id'] }, mainEntityOfPage: url });
  } else {
    g.push({ '@type': 'WebPage', name: p.title, url, inLanguage: 'ru-RU', dateModified: p.updated, ...(p.about ? { about: p.about } : {}) });
  }
  (p.jsonld || []).forEach((x) => g.push(x));
  return JSON.stringify(clean({ '@context': 'https://schema.org', '@graph': g })).replace(/</g, '\\u003c');
}

// ---------- шаблон страницы ----------
const NAV = [['Организации', '/organizacii/'], ['Услуги', '/uslugi/'], ['Соседние районы', '/sosednie-rayony/'], ['Новости', '/novosti/'], ['Контакты', '/kontakty/']];
const orgs = readJson('data/organizations.json');
const tel = (s) => '+' + s.replace(/\D/g, '');

function crumbsHtml(p) {
  if (p.url === '/') return '';
  const trail = [['Главная', '/'], ...(p.crumbs || [])];
  return `<nav class="crumbs" aria-label="Хлебные крошки"><ol>${trail.map(([n, u]) => `<li><a href="${u}">${esc(n)}</a></li>`).join('')}<li aria-current="page">${esc(p.crumb)}</li></ol></nav>`;
}

function render(p) {
  const url = site.domain + p.url;
  const robots = p.noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  const trust = p.notrust ? '' : `<footer class="trust"><p>Автор: <a href="/avtory/">${esc(site.owner.name)}</a>, ${esc(site.owner.role.toLowerCase())}. Опубликовано: <time datetime="${p.published}">${fmtDate(p.published)}</time>. Обновлено: <time datetime="${p.updated}">${fmtDate(p.updated)}</time>.</p><p>Справочная информация, не заменяет консультацию ветеринарного врача. Контакты: <a href="mailto:${esc(site.owner.email)}">${esc(site.owner.email)}</a>.</p></footer>`;
  const fresh = p.url === '/' && rotationHtml.length ? `<section class="fresh" aria-label="Материалы сайта"><h2>Материалы сайта</h2><div class="fresh-grid">${rotationHtml.join('')}</div></section>` : '';
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${robots}">
<meta property="og:type" content="${p.kind === 'article' || p.kind === 'news' ? 'article' : 'website'}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ru_RU">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${CSS}</style>
<script type="application/ld+json">${graph(p)}</script>
${METRIKA}
</head>
<body>
${METRIKA_NOSCRIPT}
<a class="skip" href="#main">Перейти к содержимому</a>
<header class="top"><div class="wrap">
<a class="brand" href="/">${esc(site.name)}</a>
<nav aria-label="Основное меню">${NAV.map(([n, u]) => `<a href="${u}">${esc(n)}</a>`).join('')}</nav>
<p class="hcall" style="margin:0">Ветстанция: <a class="phone" href="tel:${tel(orgs.station.phone)}" data-goal="call_stanciya">${esc(orgs.station.phone)}</a></p>
</div></header>
<main id="main"><div class="wrap">
${crumbsHtml(p)}
<h1>${esc(p.h1)}</h1>
<p class="answer">${p.answer}</p>
${p.body}
${fresh}
${trust}
</div></main>
<footer><div class="wrap">
<p><strong>${esc(site.name)}</strong> — неофициальный справочник по ветеринарии Месягутово и Дуванского района. Сайт не принадлежит организациям из справочника. Заказ рекламы: <a href="mailto:${esc(site.owner.email)}" data-goal="mail_ads">${esc(site.owner.email)}</a>, <a href="tel:${tel(site.owner.phone)}" data-goal="call_ads">${esc(site.owner.phone)}</a>.</p>
<nav aria-label="Служебные страницы"><a href="/o-proekte/">О проекте</a><a href="/kontakty/">Контакты</a><a href="/avtory/">Авторы и экспертиза</a><a href="/politika-konfidencialnosti/">Политика конфиденциальности</a><a href="/sitemap.xml">Карта сайта</a></nav>
</div></footer>
<div class="cookie" id="cookie" hidden><span>Сайт использует Яндекс Метрику и cookie. <a href="/politika-konfidencialnosti/">Подробнее</a></span><button type="button">Понятно</button></div>
<script>${INLINE_JS}</script>
<script src="/webmcp.js" defer></script>
</body>
</html>
`;
}

// ---------- запись файлов ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const write = (rel, content) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
};

for (const p of pages) {
  if (!p.title || p.title.length > 60) warnings.push(`${p.url}: title ${p.title?.length} знаков (нужно до 60)`);
  if (!p.description || p.description.length > 160) warnings.push(`${p.url}: description ${p.description?.length} знаков (нужно до 160)`);
  if (/<h1[\s>]/i.test(p.body)) warnings.push(`${p.url}: в теле страницы есть второй H1`);
  write(p.url === '/' ? 'index.html' : `${p.url.replace(/^\//, '')}index.html`, render(p));
}

// 404
write('404.html', render({
  url: '/404.html', kind: 'page', noindex: true, notrust: true, published: site.published, updated: site.published, crumb: 'Страница не найдена',
  title: 'Страница не найдена — Зоо-Месягутово', description: 'Такой страницы на сайте нет.', h1: 'Страница не найдена',
  answer: 'Такого адреса на сайте нет: страница могла переехать или ссылка набрана с ошибкой.',
  body: '<p>Начните с <a href="/">главной страницы</a>, посмотрите <a href="/organizacii/">ветеринарные организации Месягутово</a> или <a href="/sosednie-rayony/">соседние районы</a>.</p>',
}));

// sitemap по типам
const GROUPS = [
  ['sitemap-pages.xml', ['home', 'page', 'hub', 'org', 'service']],
  ['sitemap-catalog.xml', ['category', 'product']],
  ['sitemap-articles.xml', ['article']],
  ['sitemap-news.xml', ['news']],
];
const sitemapIndex = [];
for (const [file, kinds] of GROUPS) {
  const items = indexable.filter((p) => kinds.includes(p.kind));
  if (!items.length) continue;
  write(file, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.map((p) => `<url><loc>${site.domain}${p.url}</loc><lastmod>${p.updated}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  sitemapIndex.push(`<sitemap><loc>${site.domain}/${file}</loc><lastmod>${items.map((p) => p.updated).sort().pop()}</lastmod></sitemap>`);
}
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapIndex.join('\n')}\n</sitemapindex>\n`);

// индекс для поиска и WebMCP
write('search-index.json', JSON.stringify(indexable.filter((p) => p.url !== '/').map((p) => ({ title: p.h1, summary: p.description, url: site.domain + p.url, type: p.kind })), null, 1));

// статические файлы (CNAME, robots, llms.txt, верификации и т.д.)
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'static'), DIST);

// контакты для WebMCP берём из тех же данных, что и страницы
const contacts = {
  note: 'Сайт неофициальный. Телефоны и график уточняйте, в праздничные дни режим может отличаться. УЗИ, рентген и собственная лаборатория пока в планах.',
  veterinary_station: { name: orgs.station.name, address: orgs.station.address, phone: orgs.station.phone, schedule: orgs.station.schedule.map(([d, t]) => `${d} ${t}`).join('; '), url: site.domain + orgs.station.url },
  aravet_pharmacy: { name: `${orgs.aravet.name} (справочная информация)`, address: orgs.aravet.address, phone: orgs.aravet.phone, schedule: 'не указан', url: site.domain + orgs.aravet.url },
  site_owner: { name: `${site.owner.name}, ${site.owner.role.toLowerCase()}`, email: site.owner.email, phone: site.owner.phone, url: `${site.domain}/kontakty/` },
};
const mcpFile = path.join(DIST, 'webmcp.js');
fs.writeFileSync(mcpFile, fs.readFileSync(mcpFile, 'utf8').replace('/*CONTACTS*/null', JSON.stringify(contacts, null, 2)));

// ---------- отчёт ----------
const noidx = pages.filter((p) => p.noindex).map((p) => p.url);
console.log(`Собрано страниц: ${pages.length + 1} (в индексе: ${indexable.length}, noindex: ${noidx.length}${noidx.length ? ': ' + noidx.join(', ') : ''})`);
console.log(`Ротация: ${ROTATE ? 'сдвиг выполнен' : 'без сдвига'}; секций на главной: ${rotationHtml.length}`);
if (warnings.length) { console.log('ПРЕДУПРЕЖДЕНИЯ:\n- ' + warnings.join('\n- ')); }
else console.log('Предупреждений нет.');
