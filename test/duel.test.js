import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io as makeSocket } from 'socket.io-client';
import { DatabaseSync } from 'node:sqlite';

const root=process.cwd();let proc,base,temp;
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function waitServer(){for(let i=0;i<80;i++){try{if((await fetch(base+'/api/me')).ok)return}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('CodeClash no arrancó');}
async function account(name){const r=await fetch(base+'/api/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:name,email:`${name}@example.test`,password:'StrongTestPassword123'})});assert.equal(r.status,201);return r.headers.getSetCookie()[0].split(';')[0];}
async function api(cookie,path,body){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||r.statusText),{status:r.status,data});return data;}
function socket(cookie){return makeSocket(base,{extraHeaders:{Cookie:cookie},transports:['websocket','polling'],reconnection:false});}
function connected(s){return new Promise((resolve,reject)=>{s.once('connect',resolve);s.once('connect_error',reject);});}
function ack(s,event,data){return new Promise(resolve=>s.emit(event,data,resolve));}

test('duelo SQL de dos participantes: invitación, presencia, evaluación y ganador persistido',async t=>{
 temp=await mkdtemp(path.join(tmpdir(),'codeclash-test-'));const port=await freePort();base=`http://127.0.0.1:${port}`;
 proc=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),CODECLASH_DATA_DIR:temp,SESSION_SECRET:'test-secret-with-sufficient-length',JUDGE0_URL:''},stdio:'ignore'});
 await waitServer();const a=await account('duelA'),b=await account('duelB');
 const catalog=await api(a,'/exercises');assert.equal(catalog.exercises.filter(x=>x.type==='programming').length,12);assert.equal(catalog.exercises.filter(x=>x.type==='sql').length,10);assert.ok(!JSON.stringify(catalog).includes('privateTestCases'));
 const created=await api(a,'/challenges',{type:'sql',difficulty:'intermedio',duration:5,exercise:'students-average'});assert.match(created.inviteUrl,/invite=/);
 const accepted=await api(b,`/challenges/${created.challenge.token}/accept`,{});const s1=socket(a);let s2=socket(b);t.after(()=>{s1.disconnect();s2.disconnect()});await Promise.all([connected(s1),connected(s2)]);
 const [j1,j2]=await Promise.all([ack(s1,'match:join',{matchId:accepted.matchId}),ack(s2,'match:join',{matchId:accepted.matchId})]);assert.equal(j1.ok,true);assert.equal(j2.ok,true);
 const userB=(await api(b,'/me')).user.id;const offline=new Promise(resolve=>s1.on('match:state',state=>{if(state.players.some(p=>p.user_id===userB&&!p.connected))resolve(state)}));s2.disconnect();await offline;s2=socket(b);await connected(s2);const reconnect=await ack(s2,'match:join',{matchId:accepted.matchId});assert.equal(reconnect.ok,true);assert.equal(reconnect.state.players.find(p=>p.user_id===userB).connected,1);
 const started=new Promise(resolve=>s1.once('match:started',resolve));await ack(s1,'match:ready',{matchId:accepted.matchId});await ack(s2,'match:ready',{matchId:accepted.matchId});await started;
 const guarded=await api(a,`/matches/${accepted.matchId}/submit`,{action:'run',code:'DELETE FROM estudiantes',language:'sql'});assert.equal(guarded.status,'runtime_error');
 const wrong=await api(b,`/matches/${accepted.matchId}/submit`,{code:'SELECT 1',language:'sql'});assert.equal(wrong.status,'incorrect');
 const finished=new Promise(resolve=>s2.once('match:finished',resolve));const right=await api(a,`/matches/${accepted.matchId}/submit`,{code:'SELECT ciudad, AVG(edad) AS promedio_edad FROM estudiantes GROUP BY ciudad ORDER BY ciudad;',language:'sql'});assert.equal(right.status,'accepted');assert.equal(right.winner!==null,true);const event=await finished;assert.equal(event.match.winnerId,right.winner);
 const results=await api(b,`/matches/${accepted.matchId}/results`);assert.equal(results.submissions.length,2);assert.equal(results.match.status,'finished');const history=await api(a,'/history');assert.equal(history.stats.played,1);assert.equal(history.stats.wins,1);
 const db=new DatabaseSync(path.join(temp,'codeclash.db'));for(const ex of catalog.exercises.filter(x=>x.type==='sql'&&x.id!=='students-average')){const c=await api(a,'/challenges',{type:'sql',difficulty:ex.difficulty,duration:5,exercise:ex.id});const m=await api(b,`/challenges/${c.challenge.token}/accept`,{});db.prepare("UPDATE matches SET status='running',started_at=? WHERE id=?").run(Date.now()-100,m.matchId);const evaluation=await api(a,`/matches/${m.matchId}/submit`,{code:ex.examples[0][0],language:'sql'});assert.equal(evaluation.status,'accepted',`SQL exercise ${ex.id} should accept its catalog example`);}db.close();
 const next=await api(a,'/challenges',{type:'programming',difficulty:'principiante',duration:5,exercise:'sum-pair'});const nextMatch=await api(b,`/challenges/${next.challenge.token}/accept`,{});await Promise.all([ack(s1,'match:join',{matchId:nextMatch.matchId}),ack(s2,'match:join',{matchId:nextMatch.matchId})]);const startedAgain=new Promise(resolve=>s1.once('match:started',resolve));await ack(s1,'match:ready',{matchId:nextMatch.matchId});await ack(s2,'match:ready',{matchId:nextMatch.matchId});await startedAgain;const noJudge=await api(a,`/matches/${nextMatch.matchId}/submit`,{code:'print(1)',language:'python'}).catch(e=>e);assert.equal(noJudge.status,503);assert.match(noJudge.message,/Judge0 no está configurado/);
});

test.after(async()=>{proc?.kill('SIGTERM');if(temp)await rm(temp,{recursive:true,force:true});});
