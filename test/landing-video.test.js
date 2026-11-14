import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('landing video fallback no longer displays the obsolete landscape',()=>{
 const marker=css.lastIndexOf('/* The former pixel-landscape');
 assert.ok(marker>0,'video-specific landing override should exist');
 const tail=css.slice(marker);
 assert.match(tail,/\.landing-shell \.landing::before\s*\{\s*background-image:none;/);
 assert.match(tail,/\.landing-shell \.landing-video\.is-ready\s*\{opacity:1\}/);
});
test('video becomes visible only when its first frame is available',()=>{
 const begin=js.indexOf('function syncLandingMotion(){');
 const end=js.indexOf("document.addEventListener('visibilitychange',syncLandingMotion)",begin);
 assert.ok(begin>=0&&end>begin);
 const code=js.slice(begin,end);
 assert.match(code,/readyState\s*>=\s*2/);
 assert.match(code,/video\.onloadeddata=showReadyFrame/);
 assert.match(code,/video\.onplaying=showReadyFrame/);
 assert.doesNotMatch(code,/classList\.add\('is-playing'\)/);
 assert.match(code,/video\.onerror=.*classList\.remove\('is-ready'\)/);
});
