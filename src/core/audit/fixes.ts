export type Framework = 'nextjs' | 'react' | 'static' | 'unknown';

/** Detects the framework from response markers so fix snippets match the stack. */
export function detectFramework(html: string, headers: Record<string, string>): Framework {
  if (headers['x-powered-by']?.toLowerCase().includes('next')) return 'nextjs';
  if (/\/_next\/static|__NEXT_DATA__/.test(html)) return 'nextjs';
  if (/data-reactroot|__REACT_DEVTOOLS|react-dom/.test(html)) return 'react';
  if (/<html[\s\S]{0,4000}<body/i.test(html)) return 'static';
  return 'unknown';
}

export type Fix = { language: string; snippet: string };

export function fixFor(checkId: string, fw: Framework, ctx: Record<string, string> = {}): Fix | undefined {
  const url = ctx.url ?? 'https://example.com/page';
  const site = ctx.origin ?? 'https://example.com';
  const title = ctx.title ?? 'Primary keyword — Brand';
  const desc = ctx.description ?? 'One sentence that describes the page and gives a reason to click.';

  switch (checkId) {
    case 'title.missing':
    case 'title.length':
      if (fw === 'nextjs')
        return {
          language: 'tsx',
          snippet: `// app/<route>/page.tsx — App Router metadata\nexport const metadata = {\n  title: ${q(title)},\n  description: ${q(desc)},\n};`,
        };
      if (fw === 'react')
        return { language: 'tsx', snippet: `// In your head manager (react-helmet-async etc.)\n<Helmet>\n  <title>${esc(title)}</title>\n</Helmet>` };
      return { language: 'html', snippet: `<title>${esc(title)}</title>` };

    case 'description.missing':
    case 'description.length':
      if (fw === 'nextjs')
        return { language: 'tsx', snippet: `export const metadata = {\n  description: ${q(desc)},\n};` };
      return { language: 'html', snippet: `<meta name="description" content="${esc(desc)}" />` };

    case 'canonical.missing':
    case 'canonical.mismatch':
      if (fw === 'nextjs')
        return {
          language: 'tsx',
          snippet: `export const metadata = {\n  alternates: { canonical: ${q(url)} },\n};\n\n// Optionally set once for the whole app:\n// export const metadata = { metadataBase: new URL(${q(site)}) };`,
        };
      return { language: 'html', snippet: `<link rel="canonical" href="${esc(url)}" />` };

    case 'viewport.missing':
      if (fw === 'nextjs')
        return { language: 'tsx', snippet: `// app/layout.tsx\nexport const viewport = { width: 'device-width', initialScale: 1 };` };
      return { language: 'html', snippet: `<meta name="viewport" content="width=device-width, initial-scale=1" />` };

    case 'og.missing':
      if (fw === 'nextjs')
        return {
          language: 'tsx',
          snippet: `export const metadata = {\n  openGraph: {\n    title: ${q(title)},\n    description: ${q(desc)},\n    url: ${q(url)},\n    siteName: ${q(ctx.brand ?? 'Brand')},\n    images: [{ url: '/og.png', width: 1200, height: 630 }],\n  },\n};`,
        };
      return {
        language: 'html',
        snippet: `<meta property="og:title" content="${esc(title)}" />\n<meta property="og:description" content="${esc(desc)}" />\n<meta property="og:url" content="${esc(url)}" />\n<meta property="og:image" content="${esc(site)}/og.png" />\n<meta property="og:type" content="website" />`,
      };

    case 'twitter.missing':
      if (fw === 'nextjs')
        return {
          language: 'tsx',
          snippet: `export const metadata = {\n  twitter: { card: 'summary_large_image', title: ${q(title)}, description: ${q(desc)}, images: ['/og.png'] },\n};`,
        };
      return {
        language: 'html',
        snippet: `<meta name="twitter:card" content="summary_large_image" />\n<meta name="twitter:title" content="${esc(title)}" />\n<meta name="twitter:description" content="${esc(desc)}" />\n<meta name="twitter:image" content="${esc(site)}/og.png" />`,
      };

    case 'robots.missing':
      if (fw === 'nextjs')
        return {
          language: 'ts',
          snippet: `// app/robots.ts\nimport type { MetadataRoute } from 'next';\n\nexport default function robots(): MetadataRoute.Robots {\n  return {\n    rules: [{ userAgent: '*', allow: '/' }],\n    sitemap: '${site}/sitemap.xml',\n  };\n}`,
        };
      return {
        language: 'text',
        snippet: `# public/robots.txt\nUser-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml`,
      };

    case 'sitemap.missing':
      if (fw === 'nextjs')
        return {
          language: 'ts',
          snippet: `// app/sitemap.ts\nimport type { MetadataRoute } from 'next';\n\nexport default function sitemap(): MetadataRoute.Sitemap {\n  return [\n    { url: '${site}/', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },\n    { url: '${site}/pricing', lastModified: new Date() },\n  ];\n}`,
        };
      return {
        language: 'xml',
        snippet: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc></url>\n  <url><loc>${site}/pricing</loc></url>\n</urlset>`,
      };

    case 'image.alt':
      return {
        language: 'html',
        snippet: `<!-- Describe the image's purpose. Decorative images take an empty alt. -->\n<img src="${esc(ctx.src ?? '/screenshot.png')}" alt="Dashboard showing the weekly growth report" />\n<img src="/divider.svg" alt="" />`,
      };

    case 'h1.missing':
    case 'h1.multiple':
      return { language: 'html', snippet: `<h1>${esc(ctx.h1 ?? 'What this page is about, in the words a visitor would use')}</h1>` };

    case 'lang.missing':
      if (fw === 'nextjs')
        return { language: 'tsx', snippet: `// app/layout.tsx\nreturn (\n  <html lang="${ctx.lang ?? 'en'}">\n    <body>{children}</body>\n  </html>\n);` };
      return { language: 'html', snippet: `<html lang="${ctx.lang ?? 'en'}">` };

    case 'https.missing':
      return {
        language: 'text',
        snippet:
          'Serve the site over HTTPS and redirect HTTP permanently:\n\n' +
          '  http://host/*  ->  https://host/*   (301)\n\n' +
          'Most free hosts (GitHub Pages, Cloudflare Pages, Netlify, Vercel) issue and renew\n' +
          'certificates automatically — no cost involved.',
      };

    case 'redirect.chain':
      return {
        language: 'text',
        snippet:
          'Collapse the chain so each entry URL reaches its destination in one hop:\n' +
          `  ${ctx.chain ?? '/a -> /b -> /c'}\nbecomes\n  /a -> /c (301)`,
      };

    default:
      return undefined;
  }
}

const q = (s: string) => JSON.stringify(s);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
