import content from "../../../../../../campaigns/huddle-duck-two-places-20261022/email.json";
import {db} from "@/lib/db";
import {authenticateEmailCallback} from "@/lib/hatchflow-email";
import {dripSource} from "@/lib/drip-delivery";
import {ANNOUNCEMENT_ID,ANNOUNCEMENT_CATEGORY,ANNOUNCEMENT_DEADLINE,buildAnnouncementRequest} from "@/lib/agency-announcement";
export const maxDuration=60;
/** The existing HatchFlow registry secret stays inside the two production services. */
export async function POST(request:Request){
 if(!authenticateEmailCallback(request,process.env.HATCHFLOW_EMAIL_SECRET))return Response.json({error:"Unauthorized"},{status:401});
 const input=await request.json().catch(()=>null);
 if(!input||input.campaignId!==ANNOUNCEMENT_ID||input.contentVersion!==content.contentVersion)return Response.json({error:"Campaign content mismatch"},{status:409});
 const configured=!!process.env.EMAIL_UNSUB_SECRET?.trim()&&!process.env.EMAIL_UNSUB_SECRET.includes("[SENSITIVE]")&&!!process.env.HATCHFLOW_EMAIL_SECRET?.trim();
 if(input.action==="preview")return Response.json({campaignId:ANNOUNCEMENT_ID,contentVersion:content.contentVersion,category:ANNOUNCEMENT_CATEGORY,deadline:new Date(ANNOUNCEMENT_DEADLINE).toISOString(),configured,emailsSent:0});
 if(input.action!=="submit"||typeof input.email!=="string"||!configured)return Response.json({error:"Campaign submission unavailable"},{status:400});
 const email=input.email.trim().toLowerCase();
 const member=(await db.execute({sql:"SELECT m.eligible,m.checked_at,c.active,c.content_version,c.deadline FROM hd_owner_campaign_members m JOIN hd_owner_campaigns c ON c.id=m.campaign_id WHERE m.campaign_id=? AND m.email=?",args:[ANNOUNCEMENT_ID,email]})).rows[0];
 if(!member||member.eligible!==1||member.active!==1||member.content_version!==content.contentVersion||Date.now()-Number(member.checked_at)>60000||Date.now()>=Number(member.deadline))return Response.json({error:"Campaign recipient not currently eligible"},{status:409});
 const receipt=await dripSource(db).submit(buildAnnouncementRequest({email,...content,unsubscribeSecret:process.env.EMAIL_UNSUB_SECRET!}));
 return Response.json(receipt);
}
