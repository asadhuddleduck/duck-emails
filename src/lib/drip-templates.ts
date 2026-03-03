// ---------------------------------------------------------------------------
// 10-Email Drip Sequence Templates
// Ported from landing-page/scripts/send-drip.ts
// ---------------------------------------------------------------------------

const CTA_BASE = "https://start.huddleduck.co.uk";
const UNSUB_MAILTO =
  "mailto:asad@huddleduck.co.uk?subject=Unsubscribe&body=Please%20remove%20me%20from%20future%20emails";

export interface EmailTemplate {
  subject: string;
  preheader: string;
  utm: string;
  html: string;
}

function ctaUrl(utm: string): string {
  return `${CTA_BASE}?utm_source=email&utm_medium=drip&utm_campaign=${utm}`;
}

function wrapEmail(body: string, preheader: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<meta name="supported-color-schemes" content="light only"/>
<title>Huddle Duck</title>
</head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif;color-scheme:light only;-webkit-color-scheme:light only;">

<!-- Preheader -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
  ${preheader}
  &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F5F5;">
<tr><td align="center" style="padding:40px 16px 60px;">

<!-- Content wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

<!-- Logo -->
<tr><td align="left" style="padding:0 0 32px;">
  <img src="https://start.huddleduck.co.uk/duck-logo.png" width="44" height="44" alt="Huddle Duck" style="display:block;border-radius:10px;" />
</td></tr>

${body}

<!-- Divider -->
<tr><td style="padding:0 0 24px;">
  <div style="height:1px;background:#E5E5E5;"></div>
</td></tr>

<!-- Sign off -->
<tr><td style="padding:0 0 24px;">
  <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">Asad</p>
  <p style="margin:4px 0 0;font-size:13px;color:#999999;">Huddle Duck Ltd &middot; Solihull, UK</p>
</td></tr>

<!-- Unsubscribe -->
<tr><td style="padding:0;">
  <p style="margin:0;font-size:12px;color:#999999;line-height:1.5;">
    Not interested in AI advertising for food businesses? Totally fair -
    <a href="${UNSUB_MAILTO}" style="color:#999999;text-decoration:underline;">unsubscribe here</a>
    and I won&rsquo;t bother you again.
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<tr><td align="center" style="padding:0 0 40px;">
  <a href="${url}" style="display:inline-block;padding:14px 32px;background:#1EBA8F;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;border-radius:8px;">${text}</a>
</td></tr>`;
}

function heading(text: string): string {
  return `<tr><td align="left" style="padding:0 0 20px;">
  <h1 style="margin:0;font-size:28px;font-weight:800;color:#1A1A1A;line-height:1.3;">${text}</h1>
</td></tr>`;
}

function para(text: string, paddingBottom = 16): string {
  return `<p style="margin:0 0 ${paddingBottom}px;font-size:16px;color:#333333;line-height:1.6;">${text}</p>`;
}

function paraBlock(texts: string[]): string {
  const inner = texts.map((t, i) => para(t, i < texts.length - 1 ? 16 : 0)).join("\n  ");
  return `<tr><td style="padding:0 0 24px;">\n  ${inner}\n</td></tr>`;
}

function stepCard(num: number, title: string, desc: string): string {
  return `<tr><td style="padding:0 0 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="36" valign="top" style="padding-right:14px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#F7CE46;text-align:center;line-height:36px;font-size:16px;font-weight:800;color:#1A1A1A;">${num}</div>
      </td>
      <td valign="top">
        <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1A1A;line-height:1.4;">${title}</p>
        <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">${desc}</p>
      </td>
    </tr>
    </table>
  </td></tr>
  </table>
</td></tr>`;
}

function whiteCard(content: string, borderColor = "#E5E5E5"): string {
  return `<tr><td style="padding:0 0 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid ${borderColor};border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    ${content}
  </td></tr>
  </table>
</td></tr>`;
}

function leftBorderCard(content: string, borderColor = "#F7CE46"): string {
  return `<tr><td style="padding:0 0 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-left:4px solid ${borderColor};border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    ${content}
  </td></tr>
  </table>
</td></tr>`;
}

function psText(text: string): string {
  return `<tr><td style="padding:0 0 24px;">
  <p style="margin:0;font-size:14px;color:#555555;line-height:1.5;">P.S. ${text}</p>
</td></tr>`;
}

// ---------------------------------------------------------------------------
// Email 1: Product Introduction
// ---------------------------------------------------------------------------
function email1(): EmailTemplate {
  const body = `
${heading("I built an AI that runs ads for restaurants")}

${paraBlock([
  "If you run a restaurant, cafe, or takeaway - I&rsquo;ve spent the last few months building something I think you&rsquo;ll find interesting.",
  "It&rsquo;s an AI Ad Engine. You give it your business, and it handles your Facebook and Instagram advertising from start to finish. Here&rsquo;s what that actually looks like:",
])}

${stepCard(1, "It researches your market", "The AI analyses your area, your competitors, and your menu to figure out what will actually get people through the door.")}
${stepCard(2, "It writes your ads", "Headlines, hooks, copy - all written specifically for your business. Not generic templates. Not AI slop.")}
${stepCard(3, "It produces video creatives", "Scroll-stopping video ads made with AI-augmented production. Real content that no one would clock as AI. Not stock footage with text overlays.")}

<tr><td style="padding:0 0 28px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="36" valign="top" style="padding-right:14px;">
        <div style="width:36px;height:36px;border-radius:8px;background:#F7CE46;text-align:center;line-height:36px;font-size:16px;font-weight:800;color:#1A1A1A;">4</div>
      </td>
      <td valign="top">
        <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1A1A;line-height:1.4;">It launches and targets</p>
        <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">Campaigns go live targeting hungry customers in your area. You just review and approve. The AI handles the rest.</p>
      </td>
    </tr>
    </table>
  </td></tr>
  </table>
</td></tr>

${paraBlock([
  "I&rsquo;m opening it up for the first time. <strong style=\"color:#1A1A1A;\">&pound;497 one-time setup.</strong> No contracts. No monthly fees unless you want ongoing management.",
  "If you want to see exactly how it works and what you get, I put together a page that walks through everything:",
])}

${ctaButton("See how it works &rarr;", ctaUrl("ai-ad-engine-launch"))}`;

  return {
    subject: "I built an AI that runs ads for restaurants",
    preheader: "I built an AI that runs Facebook &amp; Instagram ads for restaurants, cafes and takeaways. Here&rsquo;s how it works.",
    utm: "ai-ad-engine-launch",
    html: wrapEmail(body, "I built an AI that runs Facebook &amp; Instagram ads for restaurants, cafes and takeaways. Here&rsquo;s how it works."),
  };
}

// ---------------------------------------------------------------------------
// Email 2: Expanding Brain Meme
// ---------------------------------------------------------------------------
function email2(): EmailTemplate {
  const MEME_URL = "https://i.imgflip.com/aldxm3.jpg";
  const body = `
${heading("The 4 stages of restaurant advertising")}

${paraBlock(["Hey,", "Yesterday I told you about the AI Ad Engine I built. Today I want to show you the evolution of restaurant advertising in one image:"])}

<!-- Meme Image -->
<tr><td align="center" style="padding:0 0 24px;">
  <img src="${MEME_URL}" width="456" alt="Expanding brain meme - the 4 stages of restaurant advertising" style="display:block;max-width:100%;height:auto;border-radius:12px;border:1px solid #E5E5E5;" />
</td></tr>

${paraBlock([
  "Look, I&rsquo;ve seen all four stages play out hundreds of times.",
  "Stage 1 is boosting posts at 11pm and hoping something sticks. We&rsquo;ve all been there.",
  "Stage 2 is paying an agency &pound;2,000-&pound;5,000 a month to run the same playbook they use for dentists, plumbers, and everyone else.",
  "Stage 3 is those generic AI tools that know nothing about food businesses and spit out the same bland ads for everyone.",
  "Stage 4 is what I actually built. An AI that&rsquo;s been trained specifically on food and drink businesses. It researches your local market, remixes your actual content into ads, and launches campaigns targeting hungry people near your locations.",
  "&pound;497, one-time. No contracts.",
])}

${ctaButton("See how it works &rarr;", ctaUrl("day2-meme"))}

${psText("The page has an AI chat that can answer any question about how it works. It knows more about this product than I do at this point.")}`;

  return {
    subject: "The 4 stages of restaurant advertising",
    preheader: "Most restaurant owners are stuck on stage 1. Where are you?",
    utm: "day2-meme",
    html: wrapEmail(body, "Most restaurant owners are stuck on stage 1. Where are you?"),
  };
}

// ---------------------------------------------------------------------------
// Email 3: Case Study - Uber Eats Phone Call
// ---------------------------------------------------------------------------
function email3(): EmailTemplate {
  const body = `
${heading("Their Uber Eats rep actually called them")}

${paraBlock(["Quick story."])}

${paraBlock([
  "Phat Buns is a burger brand with 15+ locations. They&rsquo;d been through agencies before. Nothing special happened.",
  "They tried the AI Ad Engine across their locations.",
  "Within days, their Uber Eats account manager called them. Not to sell them something. To ask what was going on with their numbers.",
])}

<!-- Quote card -->
${leftBorderCard(`
    <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1A1A1A;line-height:1.4;font-style:italic;">&ldquo;What the hell have you guys done?&rdquo;</p>
    <p style="margin:0;font-size:13px;color:#999999;">Uber Eats rep to Phat Buns</p>
`)}

${paraBlock([
  "Something had shifted across their locations. The Uber Eats team could see it from their end.",
  "Now, I&rsquo;m not going to sit here and promise this will happen for you. Every business is different. What I can tell you is this actually happened, and the AI that powered their campaigns is the same one you&rsquo;d get.",
  "Phat Buns started with the same Trial you&rsquo;d be starting with. Same &pound;497. Same process. They rated the experience 10 out of 10 and they&rsquo;re still a client today.",
  "Could it work like that for you? Honestly, I don&rsquo;t know. It could fall flat. It could surprise you. That&rsquo;s what the Trial is for: finding out without committing to a contract.",
])}

${ctaButton("Start your Trial &rarr;", ctaUrl("day3-phatbuns"))}`;

  return {
    subject: "Their Uber Eats rep actually called them",
    preheader: "\"What the hell have you guys done?\" - real words from an Uber Eats account manager.",
    utm: "day3-phatbuns",
    html: wrapEmail(body, "\"What the hell have you guys done?\" - real words from an Uber Eats account manager."),
  };
}

// ---------------------------------------------------------------------------
// Email 4: Case Study Roundup
// ---------------------------------------------------------------------------
function email4(): EmailTemplate {
  const body = `
${heading("12,000 followers before they served a single pizza")}

${paraBlock([
  "These are real stories from real clients. I&rsquo;m sharing what happened for them, not promising it&rsquo;ll happen for you. Every business is different. But this is what&rsquo;s possible when AI meets food marketing:",
])}

${whiteCard(`
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1A1A;">Dough Club <span style="font-weight:400;color:#555555;font-size:14px;">Pizza brand, launched from zero</span></p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">Pre-launch campaigns built a local audience before the restaurant even existed. 12,000 followers before their first pizza was served. Sold out for weeks after opening.</p>
`)}

${whiteCard(`
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1A1A;">Shakedown <span style="font-weight:400;color:#555555;font-size:14px;">Milkshake brand, grew from 1 to 5 locations</span></p>
    <p style="margin:0 0 6px;font-size:15px;color:#555555;line-height:1.5;">AI ad campaigns launched before every new location opening. Over 4,000 people attended their Newcastle launch alone.</p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;font-style:italic;">&ldquo;It was mental. We want to do more of this.&rdquo;</p>
`)}

${whiteCard(`
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1A1A;">Chai Green <span style="font-weight:400;color:#555555;font-size:14px;">Franchise expansion</span></p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">The AI built a franchise enquiry pipeline. 676 qualified franchise enquiries came through during the engagement. Not leads from a contact form. Filtered, qualified investor enquiries.</p>
`)}

${whiteCard(`
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1A1A;">Phat Buns <span style="font-weight:400;color:#555555;font-size:14px;">Liverpool launch</span></p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">AI launch campaign for a new location. Hit capacity after spending just 31% of the allocated marketing budget. The AI found the audience before the budget ran out.</p>
`)}

<tr><td style="padding:12px 0 28px;">
  ${para("Every one of these businesses started the same way you would. Same process. Same price. Will your results look like theirs? Maybe. Maybe better. Maybe different entirely. AI is the future of advertising and the Trial exists so you can find out what it does for your business without a big commitment.")}
  ${para("&pound;497. No contracts. First ads live within 72 hours.", 0)}
</td></tr>

${ctaButton("See the full details &rarr;", ctaUrl("day4-casestudies"))}`;

  return {
    subject: "12,000 followers before they served a single pizza",
    preheader: "4 real results from food businesses. No fluff, just what happened.",
    utm: "day4-casestudies",
    html: wrapEmail(body, "4 real results from food businesses. No fluff, just what happened."),
  };
}

// ---------------------------------------------------------------------------
// Email 5: Objection - AI Slop
// ---------------------------------------------------------------------------
function email5(): EmailTemplate {
  const body = `
${heading("&ldquo;Won&rsquo;t my ads look like they were made by AI?&rdquo;")}

${paraBlock([
  "I get this question a lot. Fair enough. Most AI-generated content looks terrible. You can spot it a mile off.",
  "Here&rsquo;s how the AI Ad Engine actually works:",
  "I don&rsquo;t generate your ads from scratch. I take your existing content (your food photos, your videos, your brand) and the AI remixes it into ads. Your food. Your brand. Your voice.",
  "The AI handles the boring stuff that humans are slow at: researching your local audience, figuring out who to target, testing what angles work, optimising every week.",
  "The creative is always built from your real content. Nobody scrolling Instagram will clock it as &ldquo;AI.&rdquo; Because the food in the ad is your actual food. The location is your actual location.",
  "Think of it like this: a chef doesn&rsquo;t stop being a chef because they use a better oven. The AI is the oven. Your content is the food.",
  "The agencies charging you &pound;3,000 a month? Many of them are already using the same AI tools behind the scenes. They&rsquo;re just not telling you. And they&rsquo;re not specialised in food businesses.",
  "&pound;497. Your content. Your brand. AI speed.",
])}

${ctaButton("See examples &rarr;", ctaUrl("day5-not-slop"))}`;

  return {
    subject: "\"Won't my ads look like they were made by AI?\"",
    preheader: "It's a fair question. Here's the honest answer.",
    utm: "day5-not-slop",
    html: wrapEmail(body, "It&rsquo;s a fair question. Here&rsquo;s the honest answer."),
  };
}

// ---------------------------------------------------------------------------
// Email 6: Objection - Price + Agency Comparison
// ---------------------------------------------------------------------------
function email6(): EmailTemplate {
  const body = `
${heading("What &pound;497 actually buys you")}

${paraBlock([
  "&pound;497 is real money. Especially when you&rsquo;re running a food business and every pound matters. I&rsquo;m not going to pretend otherwise.",
  "So let me just lay out what you&rsquo;re comparing:",
])}

<!-- Option A card -->
<tr><td style="padding:0 0 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1A1A1A;">A Marketing Agency</p>
    <p style="margin:0 0 6px;font-size:15px;color:#555555;line-height:1.5;">&bull; &pound;2,000 to &pound;5,000 per month</p>
    <p style="margin:0 0 6px;font-size:15px;color:#555555;line-height:1.5;">&bull; Weeks to onboard</p>
    <p style="margin:0 0 6px;font-size:15px;color:#555555;line-height:1.5;">&bull; Same playbook for restaurants, dentists, plumbers</p>
    <p style="margin:0 0 6px;font-size:15px;color:#555555;line-height:1.5;">&bull; 6-month contract (usually)</p>
    <p style="margin:0 0 6px;font-size:15px;color:#555555;line-height:1.5;">&bull; Content days sold separately</p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">&bull; One location covered per fee</p>
  </td></tr>
  </table>
</td></tr>

<!-- Option B card with green border -->
<tr><td style="padding:0 0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-left:4px solid #1EBA8F;border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1A1A1A;">AI Ad Engine Trial</p>
    <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;line-height:1.5;">&bull; &pound;497 one-time</p>
    <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;line-height:1.5;">&bull; First ads live within 72 hours</p>
    <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;line-height:1.5;">&bull; Built specifically for food and drink businesses</p>
    <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;line-height:1.5;">&bull; No contract, no ongoing fees</p>
    <p style="margin:0 0 6px;font-size:15px;color:#1A1A1A;line-height:1.5;">&bull; Your existing content remixed into ads</p>
    <p style="margin:0;font-size:15px;color:#1A1A1A;line-height:1.5;">&bull; Same price covers up to 50 locations</p>
  </td></tr>
  </table>
</td></tr>

${paraBlock([
  "That&rsquo;s not a typo on the last line. Whether you have 2 locations or 50, it&rsquo;s the same &pound;497.",
  "Now think about this: one quiet day at one location. How much does that cost you? For most restaurants, it&rsquo;s hundreds in lost covers. One good campaign that fills even a few extra tables pays for the Trial in the first week.",
  "And if you upgrade to Unlimited within 30 days, the full &pound;497 is credited. So the Trial is essentially free if you continue.",
])}

${ctaButton("Start for &pound;497 &rarr;", ctaUrl("day6-price"))}

${psText("There&rsquo;s no call needed. No sales meeting. You pay on the website and we get started. First ads live within 72 hours.")}`;

  return {
    subject: "What £497 actually buys you",
    preheader: "Let me do the maths on this vs. hiring an agency.",
    utm: "day6-price",
    html: wrapEmail(body, "Let me do the maths on this vs. hiring an agency."),
  };
}

// ---------------------------------------------------------------------------
// Email 7: Behind the Scenes - Timeline
// ---------------------------------------------------------------------------
function email7(): EmailTemplate {
  const timelineSteps = [
    { label: "Hour 0", title: "You pay on the website", desc: "&pound;497. No call. No meeting. Stripe handles the payment. You get a confirmation email within minutes." },
    { label: "Hour 1-4", title: "Intake form", desc: "You fill in a short form: your brand, your locations, your goals, what content you have. Takes about 10 minutes." },
    { label: "Hour 4-24", title: "AI research kicks in", desc: "The AI analyses your local market, your competitors, and your audience. It figures out who to target, what angles to use, and what&rsquo;s most likely to get people through your door. This is the bit that would take an agency weeks. The AI does it in hours." },
    { label: "Hour 24-48", title: "Creative production", desc: "Your existing content gets remixed into ads. New hooks, new angles, voiceovers. Everything is built from your real content. Your food, your locations, your brand. Nothing generated from scratch." },
    { label: "Hour 48-72", title: "Campaigns go live", desc: "Campaigns are built, targeting is set, and your ads start reaching hungry customers in your area. You review and approve before anything goes live." },
    { label: "Week 1-3", title: "Optimisation", desc: "Every week, the AI reviews performance data and adjusts. More creative is produced based on what&rsquo;s working. Each week gets better than the last." },
    { label: "End of Trial", title: "Your report", desc: "You get a detailed performance breakdown: ThumbStop rate (how many people stopped scrolling for your ad), action rates (how many people actually engaged), AI-generated intel on what optimisation tweaks to make, and a strategy review on how to get even better results going forward. Not a generic PDF with vanity metrics." },
  ];

  const cards = timelineSteps
    .map(
      (s) =>
        leftBorderCard(`
    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#F7CE46;text-transform:uppercase;letter-spacing:0.5px;">${s.label}</p>
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1A1A1A;line-height:1.4;">${s.title}</p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">${s.desc}</p>
`)
    )
    .join("\n");

  const body = `
${heading("What happens in the first 72 hours")}

${paraBlock([
  "I realised I&rsquo;ve talked a lot about results but haven&rsquo;t walked you through what actually happens when you sign up. So here&rsquo;s the honest timeline:",
])}

${cards}

<tr><td style="padding:12px 0 28px;">
  ${para("That&rsquo;s it. No mystery. No &ldquo;we&rsquo;ll get back to you in a few weeks.&rdquo; 72 hours from payment to live ads.", 0)}
</td></tr>

${ctaButton("Get started &rarr;", ctaUrl("day7-bts"))}`;

  return {
    subject: "What happens in the first 72 hours",
    preheader: "A step-by-step look at what you'd actually experience after paying.",
    utm: "day7-bts",
    html: wrapEmail(body, "A step-by-step look at what you&rsquo;d actually experience after paying."),
  };
}

// ---------------------------------------------------------------------------
// Email 8: DIY Objection
// ---------------------------------------------------------------------------
function email8(): EmailTemplate {
  const body = `
${heading("You could run your own ads. Here&rsquo;s why most don&rsquo;t.")}

${paraBlock([
  "Let me be straight with you.",
  "You absolutely can run your own Facebook ads. It&rsquo;s not magic. You boost a post, set a budget, pick an audience, and hope for the best.",
  "The problem isn&rsquo;t that it&rsquo;s hard. The problem is that it&rsquo;s slow.",
  "Here&rsquo;s what running your own ads actually looks like when you&rsquo;re also running a food business:",
  "You spend 30 minutes writing ad copy at 11pm after a long shift. You pick an audience based on guesswork because you don&rsquo;t have time to research properly. You boost the post and check back in 3 days. The results are &ldquo;meh.&rdquo; You try again next week with a different photo. Same thing.",
  "Meanwhile, the restaurant down the road has an AI researching their local market, testing 10 different angles simultaneously, and optimising every week based on real performance data. Their ads get better every single week. Yours stay the same.",
  "That&rsquo;s the gap. It&rsquo;s not skill. It&rsquo;s time and speed.",
  "The AI does in 72 hours what takes most restaurant owners months of trial and error. And it keeps getting smarter.",
  "&pound;497 buys back your evenings and gives your ads a proper chance.",
])}

${ctaButton("Let the AI handle it &rarr;", ctaUrl("day8-diy"))}

${psText("One of my clients actually asked to pause campaigns because orders picked up faster than they expected. Not saying that&rsquo;ll happen for everyone, but it&rsquo;s a nice problem to have.")}`;

  return {
    subject: "You could run your own ads. Here's why most don't.",
    preheader: "The DIY approach works. Until it doesn't.",
    utm: "day8-diy",
    html: wrapEmail(body, "The DIY approach works. Until it doesn&rsquo;t."),
  };
}

// ---------------------------------------------------------------------------
// Email 9: Scarcity + Social Proof
// ---------------------------------------------------------------------------
function email9(): EmailTemplate {
  const body = `
${heading("I can only set up 5 more this month")}

${paraBlock([
  "Quick honest update.",
  "Every AI Ad Engine setup gets my personal attention. I review the research, check the creative, and make sure the campaigns are right before they go live. That&rsquo;s why it works. And that&rsquo;s why I can&rsquo;t do unlimited setups at once.",
])}

<!-- Scarcity highlight card -->
<tr><td style="padding:0 0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(247,206,70,0.08);border:1px solid #F7CE46;border-left:4px solid #F7CE46;border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0;font-size:17px;font-weight:700;color:#1A1A1A;line-height:1.4;">I have capacity for 5 more setups this month.</p>
    <p style="margin:8px 0 0;font-size:15px;color:#555555;line-height:1.5;">After that, you&rsquo;d be waiting until next month&rsquo;s slots open.</p>
  </td></tr>
  </table>
</td></tr>

${paraBlock([
  "I&rsquo;m not saying this to pressure you. If the timing isn&rsquo;t right, it isn&rsquo;t right. But if you&rsquo;ve been thinking about it since my first email, this is worth knowing.",
  "Here&rsquo;s what other food business owners decided:",
])}

${whiteCard(`
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1A1A1A;">Burger &amp; Sauce</p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">Were cautious after being let down by agencies. Tried one campaign using their existing content. When asked to rate the experience, their marketing manager said: <em>&ldquo;Is 20 an option?&rdquo;</em></p>
`)}

${whiteCard(`
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1A1A1A;">Boo Burger</p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">Liked the experience enough to refer two other brands.</p>
`)}

${whiteCard(`
    <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1A1A1A;">Far East Kitchens</p>
    <p style="margin:0;font-size:15px;color:#555555;line-height:1.5;">Their owner jumped on camera unprompted to talk about it. No script. Just real words.</p>
`)}

<tr><td style="padding:12px 0 28px;">
  ${para("Not everyone will have the same experience. But everyone who bought was exactly where you are right now. Reading emails, weighing it up, wondering if it&rsquo;s worth trying.")}
  ${para("<strong style=\"color:#1A1A1A;\">&pound;497 &nbsp;|&nbsp; 72 hours to live ads &nbsp;|&nbsp; No contract</strong>", 0)}
</td></tr>

${ctaButton("Grab a setup slot &rarr;", ctaUrl("day9-scarcity"))}`;

  return {
    subject: "I can only set up 5 more this month",
    preheader: "Each setup gets my personal attention. That's why there's a limit.",
    utm: "day9-scarcity",
    html: wrapEmail(body, "Each setup gets my personal attention. That&rsquo;s why there&rsquo;s a limit."),
  };
}

// ---------------------------------------------------------------------------
// Email 10: The Full Picture
// ---------------------------------------------------------------------------
function email10(): EmailTemplate {
  const body = `
${heading("Everything in one place")}

${paraBlock([
  "I&rsquo;ve spent the last 9 days explaining what the AI Ad Engine does, showing you real stories, and answering every objection I could think of.",
  "After this, I&rsquo;ll ease off the pitch. I&rsquo;ll still send you useful stuff about AI, marketing, and the food industry, but I won&rsquo;t be banging on about the Trial every day.",
  "So before I shift gears, let me stack up what&rsquo;s actually on the table:",
])}

<!-- Value stack card with green border -->
<tr><td style="padding:0 0 12px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-left:4px solid #1EBA8F;border-radius:12px;">
  <tr><td style="padding:20px 24px;">
    <p style="margin:0 0 12px;font-size:17px;font-weight:700;color:#1A1A1A;">What you get for &pound;497:</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; AI audience research for your specific market and locations</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; Your existing content remixed into scroll-stopping ads</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; Full campaign build and launch on Facebook &amp; Instagram</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; 3 weeks of managed optimisation (the AI gets smarter each week)</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; Performance report showing exactly how your ads performed</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; Strategy review at the end</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; Same price whether you have 1 location or 50</p>
    <p style="margin:0 0 6px;font-size:15px;color:#333333;line-height:1.6;">&bull; First ads live within 72 hours</p>
    <p style="margin:0;font-size:15px;color:#333333;line-height:1.6;">&bull; No contract. No ongoing fees.</p>
  </td></tr>
  </table>
</td></tr>

<!-- Risk card -->
<tr><td style="padding:0 0 24px;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px;">
  <tr><td align="center" style="padding:20px 24px;">
    <p style="margin:0 0 4px;font-size:15px;color:#555555;">What you risk:</p>
    <p style="margin:0;font-size:22px;font-weight:800;color:#1A1A1A;">&pound;497</p>
  </td></tr>
  </table>
</td></tr>

${paraBlock([
  "That&rsquo;s it. That&rsquo;s the entire downside. &pound;497 and 3 weeks of your time.",
  "If it works, you&rsquo;ve found something that can fill tables and drive orders for less than any agency would charge. If it doesn&rsquo;t, you&rsquo;ve spent &pound;497 and you know. No contract tying you in. No awkward &ldquo;we need 3 more months to see results&rdquo; conversation.",
  "And if you upgrade to Unlimited within 30 days, the full &pound;497 is credited. So the Trial costs you nothing if you continue.",
  "I built this because I spent years watching agencies overcharge food businesses for mediocre results. &pound;497 is what I think a fair trial of something genuinely useful should cost.",
  "If you&rsquo;re in, the page is below. If not, no worries. I&rsquo;ll still be in your inbox with useful stuff. And if the timing is better down the line, the Trial will still be here.",
])}

${ctaButton("Start your Trial for &pound;497 &rarr;", ctaUrl("day10-final"))}

${psText("The AI chat on the page can answer anything I haven&rsquo;t covered in these emails. If you&rsquo;ve got a question that&rsquo;s holding you back, just ask it there.")}`;

  return {
    subject: "Everything in one place",
    preheader: "I've covered a lot this week. Here's it all in one email.",
    utm: "day10-final",
    html: wrapEmail(body, "I&rsquo;ve covered a lot this week. Here&rsquo;s it all in one email."),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function getEmailTemplate(num: number): EmailTemplate {
  switch (num) {
    case 1: return email1();
    case 2: return email2();
    case 3: return email3();
    case 4: return email4();
    case 5: return email5();
    case 6: return email6();
    case 7: return email7();
    case 8: return email8();
    case 9: return email9();
    case 10: return email10();
    default: throw new Error(`No template for email ${num}`);
  }
}

export const TOTAL_EMAILS = 10;
