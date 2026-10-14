import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanNoticeHtml } from '../src/server/content/noticeHtml.js';

test('notice HTML strips active content, encoded script URLs and tracking images while retaining readable text', () => {
  const { html, imageIds } = cleanNoticeHtml(`
    <p style="background:url(javascript:alert(1))" onclick="alert(1)">안내</p>
    <a href="jav&#x61;script:alert(1)">링크 하나</a><a href="java&#10;script:alert(1)">링크 둘</a>
    <a href="data:text/html,alert(1)">링크 셋</a><a href="//example.com">링크 넷</a>
    <svg><a xlink:href="javascript:alert(1)">숨김</a></svg><math><mtext>숨김</mtext></math>
    <iframe srcdoc="<script>alert(1)</script>"></iframe><script>alert(1)</script>
    <template><img src=x onerror=alert(1)></template><img src="https://example.com/tracker.png">
    <form action="https://example.com"><input name=secret><button>내용</button></form>
  `, () => false);
  assert.match(html, /<p>안내<\/p>/);
  assert.match(html, /링크 하나/);
  assert.doesNotMatch(html, /javascript|data:|tracker|onclick|style=|srcdoc|<svg|<math|<iframe|<script|<template|<form|<input|<button|숨김/i);
  assert.doesNotMatch(html, /href=/);
  assert.deepEqual(imageIds, []);
});

test('managed image URLs and alt text are rebuilt from trusted IDs instead of caller URLs or attributes', () => {
  const fileId = 'a0b1c2d3-e4f5-4678-9abc-def012345678';
  const unknownId = 'f0b1c2d3-e4f5-4678-9abc-def012345678';
  const contentId = 'b0b1c2d3-e4f5-4678-9abc-def012345678';
  const body = `<img data-file-id="${fileId}" src="https://example.com/track" srcset="evil 2x" onerror="alert(1)" alt="old"><img data-file-id="${unknownId}" src="x">`;
  const { html, imageIds } = cleanNoticeHtml(body, id => id === fileId, contentId, new Map([[fileId, '설명 " <script> & 문자']]));
  assert.deepEqual(imageIds, [fileId]);
  assert.match(html, new RegExp(`/api/files/${fileId}\\?contentId=${contentId}&amp;inline=1`));
  assert.match(html, /alt="설명 &quot; &lt;script&gt; &amp; 문자"/);
  assert.doesNotMatch(html, /example\.com|srcset|onerror|alt="old"|<script>/);
  assert.doesNotMatch(html, new RegExp(unknownId));
  const preview = cleanNoticeHtml(body, id => id === fileId).html;
  assert.match(preview, new RegExp(`/api/files/${fileId}\\?inline=1`));
  assert.doesNotMatch(preview, /contentId=/);
});

test('notice formatting preserves useful lists, tables and links with bounded attributes', () => {
  const { html } = cleanNoticeHtml('<h2>제목</h2><ol start="2"><li><strong>항목</strong></li></ol><table><caption>설명</caption><thead><tr><th scope="col" colspan="2">머리</th></tr></thead><tbody><tr><td rowspan="999" style="width:99999px">셀</td></tr></tbody></table><a href="https://example.com/info" target="_blank" rel="opener" download="x">링크</a>', () => false);
  assert.match(html, /<ol start="2">/);
  assert.match(html, /<th colspan="2" scope="col">/);
  assert.match(html, /<td>셀<\/td>/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /rowspan|style=|download=|rel="opener"/);
});

test('invalid or oversized notice HTML is rejected before rendering', () => {
  for (const input of [null, {}, '<p>nul\0</p>', 'a'.repeat(200001)]) {
    assert.throws(() => cleanNoticeHtml(input, () => false), { code: 'VALIDATION_ERROR' });
  }
});
