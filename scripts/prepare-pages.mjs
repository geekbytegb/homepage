import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const origin = "https://geekbyte.kro.kr";
const routes = {
  about: {
    title: "팀 소개 | Geek Byte",
    description: "Geek Byte의 가치와 시작부터 현재까지의 발자취를 소개합니다.",
  },
  products: {
    title: "제품·서비스 | Geek Byte",
    description: "Geek Byte가 만들고 운영하는 제품과 서비스를 확인하세요.",
  },
  notices: {
    title: "소식 | Geek Byte",
    description: "Geek Byte의 새로운 소식과 주요 공지를 확인하세요.",
  },
  events: {
    title: "행사 | Geek Byte",
    description: "Geek Byte의 강연, 세미나, 워크숍과 다양한 행사에 참여하세요.",
  },
  contact: {
    title: "문의 | Geek Byte",
    description: "협업과 제안, Geek Byte에 관한 문의를 시작하세요.",
  },
};
const source = join("dist", "index.html");
const template = await readFile(source, "utf8");

function replaceAttribute(html, selector, attribute, value) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(<[^>]+${escapedSelector}[^>]+${attribute}=")[^"]*(")`,
  );
  return html.replace(pattern, `$1${value}$2`);
}

function createPageHtml(route, metadata) {
  const url = `${origin}/${route}/`;
  let html = template.replace(
    /<title>[^<]*<\/title>/,
    `<title>${metadata.title}</title>`,
  );
  html = replaceAttribute(
    html,
    'name="description"',
    "content",
    metadata.description,
  );
  html = replaceAttribute(
    html,
    'property="og:title"',
    "content",
    metadata.title,
  );
  html = replaceAttribute(
    html,
    'property="og:description"',
    "content",
    metadata.description,
  );
  html = replaceAttribute(html, 'property="og:url"', "content", url);
  html = replaceAttribute(
    html,
    'name="twitter:title"',
    "content",
    metadata.title,
  );
  html = replaceAttribute(
    html,
    'name="twitter:description"',
    "content",
    metadata.description,
  );
  html = replaceAttribute(html, 'rel="canonical"', "href", url);
  return html;
}

for (const [route, metadata] of Object.entries(routes)) {
  const directory = join("dist", route);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "index.html"),
    createPageHtml(route, metadata),
  );
}

const notFoundHtml = replaceAttribute(
  template,
  'name="robots"',
  "content",
  "noindex,follow",
);
await writeFile(join("dist", "404.html"), notFoundHtml);
