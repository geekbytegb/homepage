import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const required = [
  "index.html",
  "404.html",
  "CNAME",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  "geek-byte-logo.png",
  ...["about", "products", "notices", "events", "contact", "intranet"].map(
    (route) => join(route, "index.html"),
  ),
];

const pages = {
  about: "팀 소개 | Geek Byte",
  products: "제품·서비스 | Geek Byte",
  notices: "소식 | Geek Byte",
  events: "행사 | Geek Byte",
  contact: "문의 | Geek Byte",
  intranet: "인트라넷 | Geek Byte",
};

await Promise.all(required.map((file) => access(join("dist", file))));

const html = await readFile(join("dist", "index.html"), "utf8");
for (const marker of [
  'rel="canonical"',
  'property="og:title"',
  'name="twitter:card"',
  'type="application/ld+json"',
  'name="referrer" content="strict-origin-when-cross-origin"',
  'http-equiv="Content-Security-Policy"',
  "object-src 'none'",
]) {
  if (!html.includes(marker)) throw new Error(`Missing HTML marker: ${marker}`);
}

const logo = await stat(join("dist", "geek-byte-logo.png"));
if (logo.size === 0) throw new Error("Logo asset is empty");

for (const [route, title] of Object.entries(pages)) {
  const routeHtml = await readFile(join("dist", route, "index.html"), "utf8");
  const canonical = `https://geekbyte.kro.kr/${route}/`;
  if (!routeHtml.includes(`<title>${title}</title>`)) {
    throw new Error(`Incorrect title for /${route}/`);
  }
  if (!routeHtml.includes(`rel="canonical" href="${canonical}"`)) {
    throw new Error(`Incorrect canonical URL for /${route}/`);
  }
  if (!routeHtml.includes(`property="og:url" content="${canonical}"`)) {
    throw new Error(`Incorrect Open Graph URL for /${route}/`);
  }
}

const intranetHtml = await readFile(
  join("dist", "intranet", "index.html"),
  "utf8",
);
if (!intranetHtml.includes('name="robots" content="noindex,follow"')) {
  throw new Error("Intranet page must not be indexed");
}

const notFoundHtml = await readFile(join("dist", "404.html"), "utf8");
if (!notFoundHtml.includes('name="robots" content="noindex,follow"')) {
  throw new Error("404 page must not be indexed");
}

console.log(`Verified ${required.length} deployment artifacts.`);
