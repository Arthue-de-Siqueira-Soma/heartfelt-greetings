const MAX_IMAGE_CHARS = 3_800_000;
const MAX_IDEA_LENGTH = 2_000;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Best-effort protection for a serverless prototype. For production, replace
// this process-local map with a shared rate limiter (e.g. Upstash Redis).
const requestCounts = globalThis.__craftbaseRequestCounts ?? new Map();
globalThis.__craftbaseRequestCounts = requestCounts;

function getAllowedOrigins() {
  return (process.env.CRAFTBASE_ALLOWED_ORIGINS || "https://arthue-de-siqueira-soma.github.io")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
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
  const maxRequests = 8;
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
    res.status(429).json({ error: "Muitas solicitações. Aguarde um minuto e tente novamente." });
    return true;
  }

  return false;
}

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const pieces = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") pieces.push(part.text);
    }
  }
  return pieces.join("\n").trim();
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Método não permitido." });
  }

  if (rateLimit(req, res)) return;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "A IA ainda não foi configurada. Defina OPENAI_API_KEY nas variáveis de ambiente do backend."
    });
  }

  const body = req.body || {};
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const version = typeof body.version === "string" ? body.version.trim().slice(0, 40) : "Não informada";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";

  if (!idea || idea.length > MAX_IDEA_LENGTH) {
    return res.status(400).json({ error: "Informe uma ideia com até 2.000 caracteres." });
  }

  if (!imageDataUrl || imageDataUrl.length > MAX_IMAGE_CHARS) {
    return res.status(400).json({ error: "Envie uma imagem válida de até aproximadamente 2,8 MB." });
  }

  const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !ALLOWED_MIME_TYPES.has(match[1])) {
    return res.status(400).json({ error: "Formato de imagem inválido. Use JPG, PNG ou WEBP." });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
        max_output_tokens: 700,
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Você é o assistente de planejamento de construções do CraftBase para Minecraft.",
                "Analise a captura de tela enviada e a ideia do jogador. Não afirme que consegue identificar coordenadas exatas ou blocos ocultos só pela imagem.",
                "Responda em português brasileiro, com: 1) o que consegue observar no terreno; 2) uma proposta de construção alinhada à ideia; 3) perguntas essenciais caso faltem informações; 4) uma lista inicial de materiais/estilo quando for possível.",
                "Não diga que criou ou anexou um arquivo .litematic: esta etapa apenas analisa e planeja a ideia.",
                `Versão Minecraft: ${version}`,
                `Ideia do jogador: ${idea}`
              ].join("\n\n")
            },
            { type: "input_image", image_url: imageDataUrl, detail: "high" }
          ]
        }]
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Do not expose provider response details, credentials, or request payloads to visitors.
      const status = response.status === 429 ? 429 : 502;
      return res.status(status).json({
        error: response.status === 429
          ? "O serviço de IA está temporariamente limitado. Tente novamente mais tarde."
          : "Não foi possível analisar a imagem agora. Verifique a configuração da IA e tente novamente."
      });
    }

    const analysis = extractOutputText(data);
    if (!analysis) {
      return res.status(502).json({ error: "A IA não retornou uma análise legível. Tente novamente." });
    }

    return res.status(200).json({ ok: true, analysis, stage: "image-analysis" });
  } catch {
    return res.status(502).json({ error: "Falha de conexão com o serviço de IA. Tente novamente." });
  }
}
