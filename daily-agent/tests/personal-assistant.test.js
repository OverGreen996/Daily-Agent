import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {PersonalMemory} from '../memory/PersonalMemory.js';
import {parseDay,parseTime} from '../memory/ScheduleDates.js';
function setup(t){const db=new DatabaseSync(':memory:');t.after(()=>db.close());let now=Date.parse('2026-09-28T01:00:00Z');return {p:new PersonalMemory(db,{timeZone:'Asia/Taipei',now:()=>now}),advance:n=>now+=n,db};}
test('profile facts, corrections require confirmation; scopes do not cross',t=>{
  const {p}=setup(t);assert.match(p.handle('我叫小明'),/小明/);p.handle('我叫小華',{scope:'phone'});
  assert.equal(p.handle('確認更新',{scope:'pc'}),null);assert.equal(p.profile()[0].value,'小明');
  p.handle('確認更新',{scope:'phone'});assert.equal(p.profile()[0].value,'小華');
  assert.equal(p.handle('假如我叫小林'),null);p.handle('忘記我的姓名');assert.equal(p.profile().length,0);
});
test('schedule dates, ambiguity, changes and deletion are deterministic',t=>{
  const {p}=setup(t);assert.match(p.handle('明天三點要開會'),/上午還是下午/);assert.equal(p.list().length,0);
  p.handle('下午');assert.equal(p.list()[0].time,'15:00');assert.equal(p.list()[0].day,'2026-09-29');
  assert.match(p.handle('我明天要幹嘛'),/開會/);p.handle('把明天的開會改到後天下午四點');
  assert.equal(p.list()[0].day,'2026-09-30');p.handle('取消後天的開會');assert.equal(p.list().length,0);
  assert.throws(()=>parseDay('2026-02-30'),/不存在/);assert.equal(parseTime('09:00').time,'09:00');
});
test('tasks, notes, project status, routine check-ins survive a new instance',t=>{
  const {p,db}=setup(t);p.handle('新增待辦 明天15:00 繳費');assert.match(p.handle('明天摘要'),/繳費/);
  const id=p.organizer.rows('task')[0].id.slice(0,8);p.handle(`修改待辦 ${id}：後天15:00 繳費`);assert.equal(p.organizer.rows('task')[0].day,'2026-09-30');
  p.handle(`完成待辦 ${id}`);assert.equal(p.organizer.rows('task').length,0);
  p.handle('新增專案 網站');p.handle('專案進度 網站：設計完成');assert.match(p.handle('查看專案'),/設計完成/);
  p.handle('會議筆記 週會：先做登入頁');assert.match(p.handle('搜尋筆記 登入'),/週會/);
  p.handle('新增習慣 每天09:00 喝水');p.handle('打卡 喝水');assert.match(p.handle('查看習慣'),/今日完成/);
  assert.equal(new PersonalMemory(db).organizer.rows('meeting').length,1);
});
test('reminders deduplicate durably, tasks without time never invent alarms',t=>{
  const {p,db}=setup(t);p.handle('新增待辦 今天09:00 報到');p.handle('新增待辦 今天 看書');
  assert.equal(p.organizer.poll().length,1);assert.equal(p.organizer.poll().length,0);
  const second=new PersonalMemory(db,{timeZone:'Asia/Taipei',now:p.now});assert.equal(second.organizer.poll().length,0);
  assert.match(p.handle('查看提醒'),/報到/);assert.doesNotMatch(p.handle('查看提醒'),/看書/);
});
test('timezone rollover and reminder cancellation',t=>{
  const {p,advance}=setup(t);p.handle('明天09:00要開會');const id=p.list()[0].id.slice(0,8);p.handle('取消行程 '+id);
  advance(86400000);assert.equal(p.organizer.poll().length,0);
  assert.equal(parseDay('明天',{now:Date.parse('2026-12-31T17:00Z'),timeZone:'Asia/Taipei'}).day,'2027-01-02');
});
