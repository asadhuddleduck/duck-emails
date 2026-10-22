import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const campaignDirectory = new URL('../campaigns/huddle-duck-two-places-20261022/', import.meta.url);
const esc = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline = s => esc(s).replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2" style="color:#171b18;text-decoration:underline">$1</a>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
export async function renderAnnouncement(unsubUrl = '{{{RESEND_UNSUBSCRIBE_URL}}}') {
  const metadata = JSON.parse(await readFile(new URL('campaign.json',campaignDirectory),'utf8'));
  const markdown = await readFile(new URL('email.md',campaignDirectory),'utf8');
  if (/[\u2013\u2014]/.test(markdown)) throw new Error('Human copy contains a prohibited dash');
  const content = markdown.trim().split(/\n\s*\n/).map(block => block.startsWith('- ')
    ? `<ul style="padding-left:22px;margin:0 0 22px">${block.split('\n').map(line=>`<li style="padding:0 0 12px">${inline(line.slice(2))}</li>`).join('')}</ul>`
    : `<p style="margin:0 0 22px">${inline(block).replace(/  \n/g,'<br>')}</p>`).join('\n');
  const footer = `Huddle Duck Ltd, registered in England and Wales, company no. 11837993, VAT no. GB 486 6262 52. 22 Ventnor Road, Solihull B92 9BU.`;
  const text = markdown.replace(/\*\*/g,'').replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1 ($2)').trim();
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(metadata.subject)}</title></head><body style="margin:0;background:#f6f5f0;color:#171b18;font:17px/1.65 Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${esc(metadata.preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:620px;background:#fff;border:1px solid #e6e5df;border-radius:16px" cellspacing="0" cellpadding="0"><tr><td style="padding:36px 30px"><p style="font-size:14px;font-weight:bold;letter-spacing:2px;margin:0 0 30px">HUDDLE DUCK</p>${content}</td></tr></table><div style="max-width:560px;padding:24px 12px;color:#666;font-size:12px;line-height:1.6">${footer}<br><a href="${esc(unsubUrl)}" style="color:inherit">Unsubscribe</a></div></td></tr></table></body></html>`;
  const version = createHash('sha256').update(JSON.stringify([metadata.subject,metadata.preheader,markdown])).digest('hex');
  return {metadata,markdown,text,html,contentVersion:version};
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const output = path.resolve(process.argv[2] ?? '.email-preview/huddle-agency-announcement');
  await mkdir(output,{recursive:true});
  const rendered=await renderAnnouncement();
  await writeFile(path.join(output,'email.html'),rendered.html);
  await writeFile(path.join(output,'email.txt'),rendered.text);
  await writeFile(path.join(output,'campaign.json'),JSON.stringify({...rendered.metadata,contentVersion:rendered.contentVersion},null,2)+'\n');
  console.log(JSON.stringify({output,contentVersion:rendered.contentVersion,subject:rendered.metadata.subject}));
}
