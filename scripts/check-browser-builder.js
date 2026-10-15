import { readFileSync } from "node:fs";

const html = readFileSync("construcoes-gratis.html", "utf8");
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
if (!match) throw new Error("Não foi encontrado o script da oficina gratuita.");
new Function(match[1]);
console.log("Script da oficina gratuita: sintaxe válida.");
