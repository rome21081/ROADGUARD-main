const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('../testscraper/node_modules/cheerio');

const root = path.resolve(__dirname, '..', 'Final Project 3rd Year');
const htmlRoot = path.join(root, 'htmlFiles');
const protectedPages = ['main.html', 'map.html', 'report.html', 'accidentlist.html', 'accident_view.html', 'management.html', 'spreedsheet.html', 'users.html', 'settings.html'];
const publicPages = ['index.html', 'login.html', 'signup.html'];
const routeSource = fs.readFileSync(path.join(root, 'jsFiles', 'routes.js'), 'utf8');

function routing(page, user = null, origin = 'http://localhost:8080') {
  const storage = new Map(user ? [['user', JSON.stringify(user)]] : []);
  const href = `${origin}/Final%20Project%203rd%20Year/htmlFiles/${page}`;
  const url = new URL(href);
  const location = { href, origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash, replace(value) { this.redirect = value; } };
  const window = { location };
  const context = vm.createContext({ window, URL, URLSearchParams, localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } });
  vm.runInContext(routeSource, context);
  return { context, window, storage, routes: window.ROADGUARD };
}

let referenceNavigation;
for (const file of [...protectedPages, ...publicPages]) {
  const full = path.join(htmlRoot, file);
  const $ = cheerio.load(fs.readFileSync(full, 'utf8'));
  assert.equal($('h1').length, 1, `Expected one page heading in ${file}`);
  const ids = $('[id]').map((_, element) => $(element).attr('id')).get();
  assert.equal(ids.length, new Set(ids).size, `Duplicate IDs in ${file}`);
  assert.equal($('a[href="#"]').length, 0, `Placeholder link in ${file}`);
  for (const element of $('a[href], link[href], script[src]').toArray()) {
    const ref = $(element).attr('href') || $(element).attr('src');
    if (/^https?:/.test(ref)) continue;
    if (ref.startsWith('#')) {
      if (file === 'accident_view.html' && ['#overview', '#location', '#vehicles', '#photos'].includes(ref)) continue;
      assert.equal($(ref).length, 1, `Missing anchor ${ref} in ${file}`);
      continue;
    }
    const target = path.resolve(htmlRoot, decodeURIComponent(ref.split(/[?#]/)[0]));
    assert(fs.existsSync(target), `Missing target ${ref} in ${file}`);
  }
  for (const label of $('label[for]').toArray()) assert.equal($('#' + $(label).attr('for')).length, 1);
  if (protectedPages.includes(file)) {
    const links = $('.sidebar nav a').map((_, element) => $(element).attr('href')).get();
    referenceNavigation ??= links;
    assert.deepEqual(links, referenceNavigation, `Inconsistent sidebar in ${file}`);
    const active = file === 'accident_view.html' ? 'accidentlist.html' : file;
    assert.equal($('.sidebar nav [aria-current="page"]').attr('href'), active);
    assert.equal($('#signOut').length, 1);
    const scripts = $('script[src]').map((_, element) => $(element).attr('src')).get();
    assert(scripts.indexOf('../jsFiles/routes.js') < scripts.indexOf('../jsFiles/workspace.js'));
    assert(scripts.includes('../jsFiles/workspace-preferences.js'));
  }
}

for (const origin of ['http://localhost:8080', 'file://']) {
  for (const page of protectedPages) {
    const target = page === 'accident_view.html' ? `${page}?id=301&type=incident` : page;
    const app = routing(target, null, origin);
    assert.equal(app.routes.requireSession(), null);
    const redirect = new URL(app.window.location.redirect, app.window.location.href);
    assert.equal(redirect.pathname.split('/').pop(), 'login.html');
    assert.equal(redirect.searchParams.get('next'), target);
    app.storage.set('user', JSON.stringify({ username: 'tester', role: 'admin' }));
    assert.equal(app.routes.session().username, 'tester');
    assert.equal(app.routes.destination(redirect.searchParams.get('next')), target);
    app.routes.logout();
    assert.equal(app.routes.session(), null);
    assert.equal(app.window.location.redirect, 'login.html');
  }
}
const app = routing('login.html');
for (const unsafe of ['https://example.com/report.html', '//example.com/main.html', 'javascript:alert(1)', '../main.html', 'login.html', 'signup.html', 'missing.html']) assert.equal(app.routes.destination(unsafe), 'main.html');
assert.equal(app.routes.reportURL('1&x=2', 'incident'), 'accident_view.html?id=1%26x%3D2&type=incident');
for (const invalid of ['null', '{}', '[]', 'false', 'invalid-json']) {
  app.storage.set('user', invalid);
  assert.equal(app.routes.session(), null);
}
for (const file of fs.readdirSync(path.join(root, 'jsFiles')).filter(file => file.endsWith('.js'))) new vm.Script(fs.readFileSync(path.join(root, 'jsFiles', file), 'utf8'), { filename: file });
const entry = cheerio.load(fs.readFileSync(path.resolve(root, '..', 'index.html'), 'utf8'));
assert(fs.existsSync(path.resolve(root, '..', decodeURIComponent(entry('a').attr('href')))));
console.log('Passed: 12 pages, all local links and anchors, consistent menus, sign-out, protected-page returns over HTTP and file URLs, unsafe redirect rejection, and JavaScript syntax.');
