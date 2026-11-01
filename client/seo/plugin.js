// Build-time SEO: static search landing pages, sitemap.xml, and link-preview tags on the app's index.html.
// SITE_URL comes from VITE_SITE_URL (set it in Vercel once the custom domain is live).
import { PAGES, SHARED } from './pages.js';

const DEFAULT_SITE_URL = 'https://vibeloop-bay.vercel.app';
const OG_IMAGE = '/og-image.png';
const HOME_TITLE = 'VibeLoop: Random Video Chat with Strangers (18+)';
const HOME_DESCRIPTION = 'Meet new people in instant 1-on-1 video calls. Free, 18+, skip any time, report in one tap, and earn VIBE tokens as you chat.';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function previewTags({ siteUrl, url, title, description }) {
  return `
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="VibeLoop" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:image" content="${siteUrl}${OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(title)}" />
    <meta name="twitter:description" content="${escape(description)}" />
    <meta name="twitter:image" content="${siteUrl}${OG_IMAGE}" />`;
}

const STYLE = `
  *{box-sizing:border-box}body{margin:0;background:#08090D;color:#cbd5e1;font-family:'Plus Jakarta Sans',system-ui,sans-serif;line-height:1.65}
  a{color:#00F0FF}header,main,footer{max-width:760px;margin:0 auto;padding:0 20px}
  header{display:flex;align-items:center;justify-content:space-between;height:64px}
  .brand{font-weight:900;letter-spacing:.08em;text-decoration:none;background:linear-gradient(90deg,#00F0FF,#f1f5f9,#FF2A7A);-webkit-background-clip:text;background-clip:text;color:transparent}
  .cta{display:inline-block;padding:14px 26px;border-radius:16px;background:linear-gradient(90deg,#00F0FF,#FF2A7A);color:#08090D;font-weight:800;text-decoration:none;letter-spacing:.04em}
  .small{padding:8px 14px;border-radius:12px;font-size:13px}
  h1{color:#fff;font-size:clamp(32px,7vw,48px);line-height:1.1;margin:40px 0 18px}
  h2{color:#fff;font-size:22px;margin:40px 0 12px}h3{color:#fff;font-size:16px;margin:0 0 4px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
  .card{background:#12151E;border:1px solid #1e2533;border-radius:18px;padding:16px}
  .card p{margin:0;font-size:14px;color:#94a3b8}li{margin:6px 0}
  details{background:#12151E;border:1px solid #1e2533;border-radius:14px;padding:12px 16px;margin:8px 0}
  summary{color:#fff;font-weight:700;cursor:pointer}.center{text-align:center;margin:44px 0}
  footer{border-top:1px solid #1e2533;margin-top:56px;padding-top:20px;padding-bottom:40px;font-size:13px;color:#64748b}
  footer a{color:#94a3b8;margin-right:14px}`;

function renderPage(page, siteUrl) {
  const url = `${siteUrl}/${page.slug}`;
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  };
  const others = PAGES.filter((p) => p.slug !== page.slug);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(page.title)}</title>
    <meta name="description" content="${escape(page.description)}" />
    <meta name="theme-color" content="#08090D" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />${previewTags({ siteUrl, url, title: page.title, description: page.description })}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&display=swap" rel="stylesheet">
    <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
    <style>${STYLE}</style>
  </head>
  <body>
    <header>
      <a class="brand" href="/">VIBELOOP</a>
      <a class="cta small" href="/chat">Start chatting</a>
    </header>
    <main>
      <h1>${escape(page.h1)}</h1>
      ${page.intro.map((p) => `<p>${escape(p)}</p>`).join('\n      ')}
      <p class="center"><a class="cta" href="/chat">START A VIDEO CHAT</a></p>
      ${page.sections.map((section) => `
      <h2>${escape(section.heading)}</h2>
      <ul>${section.bullets.map((b) => `<li>${escape(b)}</li>`).join('')}</ul>`).join('')}
      <h2>Why people choose VibeLoop</h2>
      <div class="grid">
        ${SHARED.FEATURES.map(([title, text]) => `<div class="card"><h3>${escape(title)}</h3><p>${escape(text)}</p></div>`).join('\n        ')}
      </div>
      <h2>Stay safe</h2>
      <ul>${SHARED.SAFETY_TIPS.map((tip) => `<li>${escape(tip)}</li>`).join('')}</ul>
      <h2>Questions</h2>
      ${page.faq.map(([q, a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n      ')}
      <p class="center"><a class="cta" href="/chat">MEET SOMEONE NEW</a></p>
    </main>
    <footer>
      <p>${others.map((p) => `<a href="/${p.slug}">${escape(p.h1)}</a>`).join('')}</p>
      <p><a href="/">Home</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></p>
      <p>VibeLoop is for adults 18+. Not affiliated with Omegle.</p>
    </footer>
  </body>
</html>
`;
}

function sitemap(siteUrl) {
  // /terms and /privacy are app routes sharing the home page's canonical tag, so they're left out
  const paths = ['/', ...PAGES.map((p) => `/${p.slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${siteUrl}${path}</loc></url>`).join('\n')}
</urlset>
`;
}

export default function seoPages() {
  let siteUrl = DEFAULT_SITE_URL;
  return {
    name: 'vibeloop-seo',
    configResolved(config) {
      siteUrl = (config.env.VITE_SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
    },
    // The app shell: better title, canonical and link-preview tags
    transformIndexHtml(html) {
      return html
        .replace(/<title>[^<]*<\/title>/, `<title>${HOME_TITLE}</title>`)
        .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escape(HOME_DESCRIPTION)}" />`)
        .replace('</head>', `${previewTags({ siteUrl, url: `${siteUrl}/`, title: HOME_TITLE, description: HOME_DESCRIPTION })}\n  </head>`);
    },
    generateBundle() {
      for (const page of PAGES) {
        this.emitFile({ type: 'asset', fileName: `${page.slug}.html`, source: renderPage(page, siteUrl) });
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap(siteUrl) });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${siteUrl}/sitemap.xml
`
      });
    }
  };
}
