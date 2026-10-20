const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('../testscraper/node_modules/cheerio');

const root = path.resolve(__dirname, '..', 'Final Project 3rd Year');
const htmlRoot = path.join(root, 'htmlFiles');
const protectedPages = ['main.html', 'accidentlist.html', 'settings.html'];
const workspacePages = [...protectedPages, 'map.html', 'accident_view.html'];
const disabledPages = ['report.html', 'management.html', 'spreedsheet.html', 'users.html'];
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

for (const file of disabledPages) {
  const $ = cheerio.load(fs.readFileSync(path.join(htmlRoot,file),'utf8'));
  assert.equal($('script, form, input, button').length,0,'Disabled pages must not run feature code');
  assert.equal($('meta[http-equiv="refresh"]').attr('content'),'0;url=map.html');
}
const guest = routing('map.html');
assert.equal(guest.routes.requireSession().guest,true);
assert.equal(guest.window.location.redirect,undefined);
for (const page of disabledPages) assert.equal(guest.routes.destination(page),'main.html');
for (const origin of ['http://localhost:8080', 'file://']) {
  const details = routing('accident_view.html?id=301&type=incident&from=map', null, origin);
  assert.equal(details.routes.requireSession().guest, true);
  assert.equal(details.window.location.redirect, undefined);
}
let referenceNavigation;
for (const file of [...workspacePages, ...publicPages, ...disabledPages]) {
  const full = path.join(htmlRoot, file);
  const $ = cheerio.load(fs.readFileSync(full, 'utf8'));
  assert.equal($('h1').length, 1, `Expected one page heading in ${file}`);
  const ids = $('[id]').map((_, element) => $(element).attr('id')).get();
  assert.equal(ids.length, new Set(ids).size, `Duplicate IDs in ${file}`);
  assert.equal($('a[href="#"]').length, 0, `Placeholder link in ${file}`);
  assert.equal($('a[href="report.html"],a[href="management.html"],a[href="spreedsheet.html"],a[href="users.html"]').length,0);
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
  if (workspacePages.includes(file)) {
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
console.log('Passed: page links, disabled features, public map access, consistent menus, protected returns, redirect validation, and JavaScript syntax.');
