import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const routes = ["about", "products", "notices", "events", "contact"];
const source = join("dist", "index.html");

for (const route of routes) {
  const directory = join("dist", route);
  await mkdir(directory, { recursive: true });
  await copyFile(source, join(directory, "index.html"));
}

await copyFile(source, join("dist", "404.html"));
