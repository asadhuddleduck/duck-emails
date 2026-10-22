import {createHmac} from "node:crypto";
import type {Client,InStatement} from "@libsql/client";
import {stableEmailJobId,type EmailRequest,type EmailReceipt} from "./hatchflow-email.ts";
export const ANNOUNCEMENT_ID="huddle-duck-two-places-20261022";
export const ANNOUNCEMENT_CATEGORY="huddleduck-owner-announcement";
export const ANNOUNCEMENT_DEADLINE=Date.parse("2026-10-30T18:00:00Z");
export const ANNOUNCEMENT_OWNER="codex:01a16246-8e0d-73c2-a065-fd918e7f6478:implement-single-email-plan";
export const ANNOUNCEMENT_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS hd_owner_campaigns(id TEXT PRIMARY KEY,content_version TEXT NOT NULL,owner_source TEXT NOT NULL,deadline INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 0,client_capacity INTEGER NOT NULL DEFAULT 2,accepted_clients INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS hd_owner_campaign_members(campaign_id TEXT NOT NULL,email TEXT NOT NULL,source_job_id TEXT NOT NULL UNIQUE,origins_json TEXT NOT NULL,historical_permission TEXT NOT NULL DEFAULT 'unknown',eligible INTEGER NOT NULL DEFAULT 0,checked_at INTEGER NOT NULL,exclusion_reason TEXT,status TEXT NOT NULL DEFAULT 'ready',accepted_at TEXT,resend_id TEXT,PRIMARY KEY(campaign_id,email))`,
] as const;
export const announcementJobId=(email:string)=>stableEmailJobId(ANNOUNCEMENT_ID,email.trim().toLowerCase(),"announcement");
export function announcementAcceptedStatements(request:EmailRequest,receipt:EmailReceipt):InStatement[]{
 if(request.category!==ANNOUNCEMENT_CATEGORY||request.eligibility?.campaignId!==ANNOUNCEMENT_ID||request.sourceJobId!==announcementJobId(request.to))throw new Error("Acceptance does not match the announcement");
 return [{sql:"UPDATE hd_owner_campaign_members SET status='accepted',accepted_at=?,resend_id=? WHERE campaign_id=? AND email=? AND source_job_id=?",args:[receipt.acceptedAt!,receipt.resendId!,ANNOUNCEMENT_ID,request.to,request.sourceJobId]}];
}
export async function announcementEligibility(database:Client,request:EmailRequest,now=Date.now()){
 if(request.source!=="duck-emails"||request.brand!=="huddleduck"||request.purpose!=="marketing"||request.category!==ANNOUNCEMENT_CATEGORY||request.eligibility?.campaignId!==ANNOUNCEMENT_ID||request.sourceJobId!==announcementJobId(request.to))return {eligible:false,reason:"unknown_announcement"};
 const row=(await database.execute({sql:"SELECT c.*,m.eligible,m.checked_at,m.exclusion_reason,m.source_job_id FROM hd_owner_campaigns c JOIN hd_owner_campaign_members m ON m.campaign_id=c.id WHERE c.id=? AND m.email=?",args:[ANNOUNCEMENT_ID,request.to]})).rows[0];
 if(!row||row.owner_source!==ANNOUNCEMENT_OWNER||row.content_version!==request.contentVersion||row.source_job_id!==request.sourceJobId)return {eligible:false,reason:"announcement_approval_mismatch"};
 if(now>=Number(row.deadline)||Number(row.accepted_clients)>=Number(row.client_capacity))return {eligible:false,reason:"campaign_closed"};
 if(Number(row.active)!==1)throw new Error("Campaign is staged but not activated");
 if(now-Number(row.checked_at)>60_000||Number(row.checked_at)>now+1000)throw new Error("Live campaign eligibility needs refreshing");
 if(Number(row.eligible)!==1)return {eligible:false,reason:String(row.exclusion_reason||"campaign_recipient_excluded")};
 const stop=(await database.execute({sql:"SELECT reason FROM drip_unsubscribes WHERE lower(trim(email))=?",args:[request.to]})).rows.find(r=>!["customer","superpulse-waitlist","purchased"].includes(String(r.reason)));
 if(stop)return {eligible:false,reason:"local_marketing_stop"};
 return {eligible:true,contentVersion:request.contentVersion};
}
export function buildAnnouncementRequest(input:{email:string;subject:string;html:string;text:string;contentVersion:string;unsubscribeSecret:string}):Omit<EmailRequest,"source">{
 if(!input.unsubscribeSecret)throw new Error("EMAIL_UNSUB_SECRET is required");
 const email=input.email.trim().toLowerCase();
 const token=createHmac("sha256",input.unsubscribeSecret).update(email).digest("hex");
 const unsubUrl="https://duck-emails-ten.vercel.app/api/email/unsubscribe?"+new URLSearchParams({e:email,t:token});
 return {to:email,sourceJobId:announcementJobId(email),brand:"huddleduck",purpose:"marketing",category:ANNOUNCEMENT_CATEGORY,subject:input.subject,html:input.html.replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}",unsubUrl),text:input.text,unsubUrl,contentVersion:input.contentVersion,eligibility:{campaignId:ANNOUNCEMENT_ID,kind:"owner_directed_announcement",ownerSource:ANNOUNCEMENT_OWNER}};
}
