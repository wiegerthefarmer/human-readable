#!/usr/bin/env node
'use strict';
const fs = require('fs');

const SITE = 'https://wiegerthefarmer.github.io/human-readable';
const FEED_TITLE = 'Human-Readable';
const FEED_DESC = 'Notes from the interface between people and computers.';

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const data = JSON.parse(fs.readFileSync('comics.json', 'utf8'));
const comics = (data.comics || []).slice().reverse();

const items = comics.map(c => {
  const url = `${SITE}/${c.id}`;
  const imgUrl = `${SITE}/${c.image}`;
  const title = esc(c.title);
  const desc = esc(c.alt || c.title);
  return `    <item>
      <title>${title}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description><![CDATA[<img src="${imgUrl}" alt="${esc(c.alt || c.title)}"><br>${esc(c.alt || '')}]]></description>
      <enclosure url="${imgUrl}" type="image/png" length="0"/>
    </item>`;
}).join('\n');

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(FEED_TITLE)}</title>
    <link>${SITE}/</link>
    <description>${esc(FEED_DESC)}</description>
    <language>en</language>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

fs.writeFileSync('feed.xml', feed, 'utf8');
console.log(`Generated feed.xml with ${comics.length} item(s).`);
