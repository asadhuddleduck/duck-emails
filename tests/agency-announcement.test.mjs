import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@libsql/client';
import {ANNOUNCEMENT_SCHEMA,ANNOUNCEMENT_ID,ANNOUNCEMENT_OWNER,ANNOUNCEMENT_DEADLINE,buildAnnouncementRequest,announcementEligibility} from '../src/lib/agency-announcement.ts';
import {renderAnnouncement} from '../scripts/render-agency-announcement.mjs';
test('announcement freezes one identity, signed unsubscribe and approved copy',async()=>{
 const r=await renderAnnouncement();
 const first=buildAnnouncementRequest({email:'Synthetic@Example.invalid',subject:r.metadata.subject,html:r.html,text:r.text,contentVersion:r.contentVersion,unsubscribeSecret:'offline-only-secret'});
 assert.equal(first.sourceJobId,buildAnnouncementRequest({...first,email:'synthetic@example.invalid',unsubscribeSecret:'offline-only-secret'}).sourceJobId);
 assert.match(first.html,/api\/email\/unsubscribe/);assert.doesNotMatch(first.html,/RESEND_UNSUBSCRIBE_URL/);
 assert.match(first.text,/£1,300 \+ VAT/);assert.match(first.text,/Friday 30 October at 6pm/);assert.doesNotMatch(first.text,/[\u2013\u2014]/);
});
test('campaign approval is separate from opt-in and old drip state; stale proof holds',async()=>{
 const db=createClient({url:'file::memory:'}),now=Date.parse('2026-10-22T10:00:00Z');
 try{
  await db.batch([...ANNOUNCEMENT_SCHEMA,'CREATE TABLE drip_unsubscribes(email TEXT PRIMARY KEY,reason TEXT)'],'write');
  const r=await renderAnnouncement();const request={source:'duck-emails',...buildAnnouncementRequest({email:'synthetic@example.invalid',subject:r.metadata.subject,html:r.html,text:r.text,contentVersion:r.contentVersion,unsubscribeSecret:'offline'})};
  await db.execute({sql:'INSERT INTO hd_owner_campaigns VALUES(?,?,?,?,?,?,?,?)',args:[ANNOUNCEMENT_ID,r.contentVersion,ANNOUNCEMENT_OWNER,ANNOUNCEMENT_DEADLINE,1,2,0,now]});
  await db.execute({sql:'INSERT INTO hd_owner_campaign_members(campaign_id,email,source_job_id,origins_json,eligible,checked_at) VALUES(?,?,?,?,?,?)',args:[ANNOUNCEMENT_ID,request.to,request.sourceJobId,'["legacy-list"]',1,now]});
  assert.equal((await announcementEligibility(db,request,now)).eligible,true);
  assert.equal((await db.execute('SELECT historical_permission FROM hd_owner_campaign_members')).rows[0].historical_permission,'unknown');
  await assert.rejects(announcementEligibility(db,request,now+61_000),/refresh/i);
  await db.execute({sql:'INSERT INTO drip_unsubscribes VALUES(?,?)',args:[request.to,'manual']});
  assert.equal((await announcementEligibility(db,request,now)).eligible,false);
  assert.equal((await announcementEligibility(db,request,ANNOUNCEMENT_DEADLINE)).reason,'campaign_closed');
 }finally{db.close();}
});
