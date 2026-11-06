import test from 'node:test';import assert from 'node:assert/strict';
import {preferredLanguage,translateText} from '../../src/i18n/translate.js';
import messages from '../../src/i18n/messages.json' with {type:'json'};
test('language preference is persistent, validated and falls back to browser language',()=>{
 assert.equal(preferredLanguage(null,'ko-KR'),'ko');assert.equal(preferredLanguage(null,'en-US'),'en');assert.equal(preferredLanguage(null,'fr'),'en');
 assert.equal(preferredLanguage({getItem:()=> 'en'},'ko-KR'),'en');assert.equal(preferredLanguage({getItem:()=> 'ko'},'en-US'),'ko');
 assert.equal(preferredLanguage({getItem:()=> 'invalid'},'ko'),'ko');assert.equal(preferredLanguage({getItem(){throw Error();}},'en'),'en');
});
test('English catalog covers all registered static and dynamic messages',()=>{
 for(const [source] of messages){const output=translateText(source.replace(/\{\d+\}/g,'3'),'en');assert.ok(!/[가-힣]/.test(output),`${source} → ${output}`);}
});
test('readable reasons and accessibility counts preserve measured quantities',()=>{
 assert.equal(translateText('상대의 최단 경로를 4칸 늘리는 벽입니다.','en'),"This wall adds 4 steps to the opponent's shortest route.");
 assert.equal(translateText('상대의 최단 경로를 1칸 늘리는 벽입니다.','en'),"This wall adds 1 step to the opponent's shortest route.");
 assert.equal(translateText('남은 벽 0개 / 10개','en'),'0 of 10 walls remaining');
 assert.equal(translateText('청록 · 목표까지 7칸','en'),'Teal · 7 steps to goal');
 assert.equal(translateText('청록 · 내 수','en'),'Teal · Your move');
 assert.equal(translateText('상대 수 · 말 이동','en'),'Opponent move · Pawn move');
 assert.equal(translateText('내 경로 3칸 · 상대 경로 12칸','en'),'Your route 3 · opponent route 12');
 assert.equal(translateText('d6─ · Sigma 4 · Web','en'),'d6─ · Sigma 4 · Web');
 assert.equal(translateText('목표까지 남은 최단 경로를 1칸 줄이는 전진입니다.','ko'),'목표까지 남은 최단 경로를 1칸 줄이는 전진입니다.');
});
