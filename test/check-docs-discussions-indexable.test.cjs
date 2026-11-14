// test/check-docs-discussions-indexable.test.cjs - the release posts stay indexable.
//
// The docs layout once carried an unconditional noindex for every page under
// /discussions/ ("a copy source, not a docs destination"). freestruct honors a
// noindex meta, so that dropped every release post from sitemap.xml, feed.xml,
// and search.json - the whole announcement trail was invisible to crawlers.
// The owner retired that design: the trail is part of the SEO surface. This
// test keeps it retired - a layout that noindexes the discussions path, or a
// post that opts itself out, reds here.
//
// Bite proven by restoring the layout's noindex meta (or adding `noindex: true`
// to a post): the run goes red.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');

const DOCS = resolve(__dirname, '..', 'docs');
const LAYOUTS = join(DOCS, '_layouts');
const POSTS = join(DOCS, 'discussions');

const layouts = () => readdirSync(LAYOUTS).filter((f) => f.endsWith('.html'));
const posts = () => readdirSync(POSTS).filter((f) => /^announcing-v.+\.md$/.test(f));

test('no layout noindexes the /discussions/ path', () => {
  const files = layouts();
  assert.ok(files.length > 0, 'expected a layout under docs/_layouts');
  for (const f of files) {
    const src = readFileSync(join(LAYOUTS, f), 'utf8');
    // Any conditional keyed on the discussions path that also emits a robots
    // noindex is the retired design - red on it.
    const conditionalNoindex = /page\.permalink\s+contains\s+['"]\/discussions\/['"][\s\S]{0,400}?name=["']robots["']/i.test(src)
      || /name=["']robots["'][\s\S]{0,400}?page\.permalink\s+contains\s+['"]\/discussions\/['"]/i.test(src);
    assert.ok(!conditionalNoindex, `${f}: the discussions path is noindexed again - release posts must stay in sitemap/feed/search`);
    // A bare, unconditional noindex would be worse.
    if (/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(src)) {
      assert.fail(`${f}: carries an unconditional robots noindex - every docs page would drop from the sitemap`);
    }
  }
});

test('no release post opts itself out of indexing', () => {
  const files = posts();
  assert.ok(files.length >= 3, 'expected the release posts to be present');
  for (const f of files) {
    const head = readFileSync(join(POSTS, f), 'utf8').split('---')[1] ?? '';
    assert.ok(
      !/^\s*noindex:\s*true\s*$/m.test(head),
      `${f}: sets noindex: true - the release trail is indexable now`
    );
  }
});
