import { buildLitematic } from "./generate.js";

const MAX_IMAGE_CHARS = 3_800_000;
const MAX_IDEA_LENGTH = 2_000;
const MAX_BLOCKS = 600;
const MAX_AXIS = 24;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const requestCounts = globalThis.__craftbaseCreateCounts ?? new Map();
globalThis.__craftbaseCreateCounts = requestCounts;

function getAllowedOrigins() {
  return (process.env.CRAFTBASE_ALLOWED_ORIGINS || "https://arthue-de-siqueira-soma.github.io")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(204).end();
    return true;
  }
  if (origin && !allowedOrigins.includes(origin)) {
    res.status(403).json({ error: "Origem não autorizada." });
    return true;
  }
  return false;
}

function rateLimit(req, res) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 3;
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "unknown";
  const current = requestCounts.get(ip);
  if (!current || now - current.start >= windowMs) {
    requestCounts.set(ip, { start: now, count: 1 });
    return false;
  }
  current.count += 1;
  if (current.count > maxRequests) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Muitos pedidos de construção. Aguarde um minuto e tente novamente." });
    return true;
  }
  return false;
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const pieces = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") pieces.push(part.text);
    }
  }
  return pieces.join("\n").trim();
}

export function normalizeBuildPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new Error("A IA não retornou um projeto válido.");
  }
  const name = typeof plan.name === "string" ? plan.name.trim().slice(0, 80) : "";
  const description = typeof plan.description === "string" ? plan.description.trim().slice(0, 500) : "";
  const summary = typeof plan.summary === "string" ? plan.summary.trim().slice(0, 1_200) : "";
  if (!name || !Array.isArray(plan.blocks) || plan.blocks.length < 1 || plan.blocks.length > MAX_BLOCKS) {
    throw new Error("O projeto precisa ter nome e uma lista de 1 a 600 blocos.");
  }

  const seen = new Set();
  const blocks = plan.blocks.map((item) => {
    if (!item || !Number.isSafeInteger(item.x) || !Number.isSafeInteger(item.y) || !Number.isSafeInteger(item.z)) {
      throw new Error("O plano contém coordenadas inválidas.");
    }
    if ([item.x, item.y, item.z].some((coordinate) => coordinate < 0 || coordinate >= MAX_AXIS)) {
      throw new Error("A construção gerada deve caber em uma área de até 24×24×24 blocos.");
    }
    if (typeof item.block !== "string" || !/^minecraft:[a-z0-9_]+$/.test(item.block)) {
      throw new Error("O plano contém um bloco inválido. Esta versão aceita blocos vanilla do Minecraft.");
    }
    const key = `${item.x},${item.y},${item.z}`;
    if (seen.has(key)) throw new Error("O plano contém duas peças na mesma coordenada.");
    seen.add(key);
    return { x: item.x, y: item.y, z: item.z, block: item.block };
  });

  return { name, description, summary, blocks };
}

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    summary: { type: "string" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          x: { type: "integer" },
          y: { type: "integer" },
          z: { type: "integer" },
          block: { type: "string" }
        },
        required: ["x", "y", "z", "block"]
      }
    }
  },
  required: ["name", "description", "summary", "blocks"]
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Método não permitido." });
  }
  if (rateLimit(req, res)) return;
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "O gerador por IA ainda não foi configurado. Cadastre OPENAI_API_KEY nas variáveis de ambiente do backend."
    });
  }

  let body = req.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch {
      return res.status(400).json({ error: "Envie um objeto JSON válido." });
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return res.status(400).json({ error: "Envie um objeto JSON válido." });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const version = typeof body.version === "string" ? body.version.trim().slice(0, 40) : "1.21.8";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!idea || idea.length > MAX_IDEA_LENGTH) {
    return res.status(400).json({ error: "Descreva a construção em até 2.000 caracteres." });
  }
  if (!imageDataUrl || imageDataUrl.length > MAX_IMAGE_CHARS) {
    return res.status(400).json({ error: "Envie uma imagem JPG, PNG ou WEBP de até aproximadamente 2,8 MB." });
  }
  const imageMatch = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!imageMatch || !ALLOWED_MIME_TYPES.has(imageMatch[1])) {
    return res.status(400).json({ error: "Formato de imagem inválido. Use JPG, PNG ou WEBP." });
  }

  try {
    const prompt = [
      "Você é o planejador de construções do CraftBase para Minecraft Java.",
      "Crie uma construção coerente a partir da ideia e use a imagem apenas como contexto visual do terreno/ambiente.",
      "IMPORTANTE: uma captura de tela não revela coordenadas exatas, profundidade, blocos ocultos ou orientação completa. Não tente reproduzir o terreno inteiro. Gere um schematic autônomo, colocado na origem local (0,0,0), que o jogador possa posicionar manualmente com Litematica.",
      "Produza um projeto pequeno, útil e reconhecível, não uma plataforma genérica. Prefira uma casa/base/estrutura completa com fundação, paredes, entradas, telhado e detalhes de acordo com a ideia.",
      "Use somente blocos vanilla com identificadores minecraft:..., sem mods. Não use minecraft:air; omita posições vazias. Não repita coordenadas.",
      "Todas as coordenadas x, y, z devem ser inteiros entre 0 e 23. Use y=0 para a base da construção. O volume deve caber em 24x24x24 e a lista deve conter no máximo 600 blocos.",
      "Escolha estados padrão dos blocos; esta primeira versão não suporta direção de escadas, portas, slabs ou outras propriedades especiais. Evite blocos que dependam de propriedades para fazer sentido; prefira blocos completos como stone_bricks, oak_planks, glass, cobblestone, logs, leaves e lanterns.",
      "Retorne somente o JSON que corresponda ao esquema: name, description, summary e blocks (cada item com x, y, z, block). A descrição e o resumo devem estar em português brasileiro.",
      `Versão informada: ${version}`,
      `Pedido do jogador: ${idea}`
    ].join("\n\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        max_output_tokens: 10_000,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "craftbase_build_plan",
            strict: true,
            schema: PLAN_SCHEMA
          }
        },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl, detail: "high" }
          ]
        }]
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status === 429 ? 429 : 502).json({
        error: response.status === 429
          ? "O serviço de IA está temporariamente limitado. Tente mais tarde."
          : "A IA não conseguiu montar a construção. Verifique a configuração do backend e tente novamente."
      });
    }

    const output = extractOutputText(data);
    if (!output) return res.status(502).json({ error: "A IA não retornou um projeto legível." });

    let rawPlan;
    try { rawPlan = JSON.parse(output); } catch {
      return res.status(502).json({ error: "A resposta da IA veio incompleta. Tente uma construção menor." });
    }

    const plan = normalizeBuildPlan(rawPlan);
    const generated = buildLitematic({
      name: plan.name,
      description: plan.description || plan.summary,
      blocks: plan.blocks
    });

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${generated.name}.litematic"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-CraftBase-Size", `${generated.dimensions.x}x${generated.dimensions.y}x${generated.dimensions.z}`);
    res.setHeader("X-CraftBase-Block-Count", String(generated.totalBlocks));
    res.setHeader("X-CraftBase-Plan-Summary", encodeURIComponent(plan.summary.slice(0, 500)));
    return res.status(200).end(generated.file);
  } catch {
    return res.status(502).json({ error: "Não foi possível planejar a construção. Tente uma ideia menor ou mais específica." });
  }
}
