// Проверка готового сайта (dist/): ссылки, H1, canonical, JSON-LD, Метрика, верификации.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const errors = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(DIST);
const htmls = files.filter((f) => f.endsWith('.html') && !/googled|yandex_/.test(f));

const exists = (url) => {
  const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
  const p = path.join(DIST, clean);
  return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html')));
};

for (const f of htmls) {
  const rel = path.relative(DIST, f);
  const html = fs.readFileSync(f, 'utf8');
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(`${rel}: H1 = ${h1}`);
  if (!/<link rel="canonical" href="https:\/\/zoo-rus\.ru[^"]*">/.test(html)) errors.push(`${rel}: нет canonical`);
  if (!html.includes('mc.yandex.ru/metrika/tag.js?id=114168885')) errors.push(`${rel}: нет кода Метрики`);
  if (!html.includes("localStorage.getItem('zoo_consent_analytics')") || !/if \(v === 'yes'\) zooLoadMetrika\(\)/.test(html)) errors.push(`${rel}: Метрика не привязана к согласию`);
  if (/<noscript>[\s\S]*mc\.yandex\.ru\/watch/.test(html)) errors.push(`${rel}: пиксель Метрики в noscript работает без согласия`);
  if (!html.includes('id="zoo-consent-yes"') || !html.includes('id="zoo-cookie-settings"')) errors.push(`${rel}: нет баннера согласия или ссылки «Настройки cookie»`);
  if (!html.includes('<html lang="ru">')) errors.push(`${rel}: нет lang="ru"`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { errors.push(`${rel}: JSON-LD не разбирается`); }
  }
  for (const m of html.matchAll(/href="(\/[^"]*)"/g)) if (!exists(m[1])) errors.push(`${rel}: битая ссылка ${m[1]}`);
  if (/\[ЗАПОЛНИТЬ\]/.test(html) && !/noindex/.test(html)) errors.push(`${rel}: заглушка [ЗАПОЛНИТЬ] на индексируемой странице`);
}

for (const need of ['sitemap.xml', 'robots.txt', 'llms.txt', 'ai-guide.txt', 'ai-catalog.json', 'webmcp.js', 'CNAME', '404.html', 'googled005414cfdf84903.html', 'yandex_82c6400a99edc483.html']) {
  if (!fs.existsSync(path.join(DIST, need))) errors.push(`нет файла ${need}`);
}
for (const j of files.filter((f) => f.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(j, 'utf8')); } catch (e) { errors.push(`${path.relative(DIST, j)}: некорректный JSON`); }
}
const mcp = fs.readFileSync(path.join(DIST, 'webmcp.js'), 'utf8');
for (const m of ['/*CONTACTS*/', '/*CATEGORIES*/', '/*TYPES*/']) if (mcp.includes(m)) errors.push(`webmcp.js: не подставлено ${m}`);
// каталог для ИИ: все адреса существуют, инструменты WebMCP объявлены в каталоге
const cat = JSON.parse(fs.readFileSync(path.join(DIST, 'ai-catalog.json'), 'utf8'));
for (const c of cat.categories) for (const a of c.articles) if (!exists(new URL(a.url).pathname)) errors.push(`ai-catalog.json: нет страницы ${a.url}`);
for (const t of cat.availableTools) if (!mcp.includes(`name: '${t.name}'`)) errors.push(`webmcp.js: нет инструмента ${t.name}`);
for (const f of ['llms.txt', 'ai-guide.txt']) {
  for (const m of fs.readFileSync(path.join(DIST, f), 'utf8').matchAll(/\]\(https:\/\/zoo-rus\.ru([^)]*)\)/g)) if (!exists(m[1])) errors.push(`${f}: нет страницы ${m[1]}`);
}

// все страницы из sitemap должны существовать
for (const sm of files.filter((f) => /sitemap-.*\.xml$/.test(f))) {
  for (const m of fs.readFileSync(sm, 'utf8').matchAll(/<loc>https:\/\/zoo-rus\.ru([^<]*)<\/loc>/g)) {
    if (!exists(m[1])) errors.push(`${path.basename(sm)}: нет страницы ${m[1]}`);
  }
}

console.log(`Проверено HTML-страниц: ${htmls.length}`);
if (errors.length) { console.log('ОШИБКИ:\n- ' + errors.join('\n- ')); process.exit(1); }
console.log('Ошибок нет.');
