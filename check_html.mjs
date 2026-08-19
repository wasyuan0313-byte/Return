import fs from "node:fs";
import vm from "node:vm";
const html = fs.readFileSync("index.html", "utf8");
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
for (const code of blocks) new vm.Script(code);
console.log(`OK: ${blocks.length} inline script block(s) parsed`);
