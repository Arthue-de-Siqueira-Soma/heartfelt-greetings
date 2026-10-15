import { gzipSync } from "node:zlib";

const MAX_BLOCKS = 50_000;
const MAX_AXIS = 48;
const MAX_VOLUME = 110_592;
const ALLOWED_ORIGINS = (
  process.env.CRAFTBASE_ALLOWED_ORIGINS ||
  "https://arthue-de-siqueira-soma.github.io"
).split(",").map((value) => value.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    res.status(403).json({ error: "Origem não autorizada." });
    return true;
  }
  return false;
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

function int64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt.asIntN(64, BigInt(value)), 0);
  return buffer;
}

function nbtString(value) {
  const data = Buffer.from(String(value), "utf8");
  if (data.length > 65_535) throw new Error("Texto NBT muito longo.");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(data.length, 0);
  return Buffer.concat([length, data]);
}

function namedTag(type, name, payload) {
  return Buffer.concat([Buffer.from([type]), nbtString(name), payload]);
}

function tagString(name, value) {
  return namedTag(8, name, nbtString(value));
}

function tagInt(name, value) {
  return namedTag(3, name, int32(value));
}

function tagLong(name, value) {
  return namedTag(4, name, int64(value));
}

function tagCompound(name, children) {
  return namedTag(10, name, Buffer.concat([...children, Buffer.from([0])]));
}

function tagList(name, childType, payloads) {
  return namedTag(9, name, Buffer.concat([
    Buffer.from([childType]),
    int32(payloads.length),
    ...payloads
  ]));
}

function tagLongArray(name, values) {
  return namedTag(12, name, Buffer.concat([
    int32(values.length),
    ...values.map(int64)
  ]));
}

function compoundPayload(children) {
  return Buffer.concat([...children, Buffer.from([0])]);
}

function coordinateCompound(name, x, y, z) {
  return tagCompound(name, [
    tagInt("x", x),
    tagInt("y", y),
    tagInt("z", z)
  ]);
}

function packPaletteIndices(indices, paletteLength) {
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, paletteLength))));
  const mask = (1n << BigInt(bits)) - 1n;
  const longCount = Math.ceil((indices.length * bits) / 64);
  const packed = Array.from({ length: longCount }, () => 0n);

  for (let index = 0; index < indices.length; index += 1) {
    const value = BigInt(indices[index]) & mask;
    const bitPosition = index * bits;
    const longIndex = Math.floor(bitPosition / 64);
    const bitOffset = bitPosition % 64;
    packed[longIndex] |= value << BigInt(bitOffset);

    if (bitOffset + bits > 64) {
      packed[longIndex + 1] |= value >> BigInt(64 - bitOffset);
    }
  }

  return packed.map((value) => BigInt.asIntN(64, value));
}

function sanitizeFilename(value) {
  const base = String(value || "craftbase-construcao")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "craftbase-construcao";
}

export function buildLitematic(input) {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  const description = typeof input.description === "string"
    ? input.description.trim().slice(0, 500)
    : "";
  const rawBlocks = input.blocks;

  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0 || rawBlocks.length > MAX_BLOCKS) {
    throw new Error(`Envie uma lista com 1 a ${MAX_BLOCKS} blocos.`);
  }

  const seen = new Set();
  const blocks = [];

  for (const item of rawBlocks) {
    if (!item || !Number.isSafeInteger(item.x) || !Number.isSafeInteger(item.y) || !Number.isSafeInteger(item.z)) {
      throw new Error("Cada bloco precisa ter coordenadas inteiras seguras x, y e z.");
    }

    const block = typeof item.block === "string" ? item.block.trim() : "";
    if (!/^minecraft:[a-z0-9_]+$/.test(block)) {
      throw new Error("Use identificadores de blocos vanilla, como minecraft:stone.");
    }

    const key = `${item.x},${item.y},${item.z}`;
    if (seen.has(key)) throw new Error("Há coordenadas duplicadas na lista de blocos.");
    seen.add(key);
    blocks.push({ x: item.x, y: item.y, z: item.z, block });
  }

  // Use a loop instead of spreading up to 50,000 coordinates into Math.min/max.
  let minX = blocks[0].x;
  let minY = blocks[0].y;
  let minZ = blocks[0].z;
  let maxX = blocks[0].x;
  let maxY = blocks[0].y;
  let maxZ = blocks[0].z;

  for (const block of blocks) {
    minX = Math.min(minX, block.x);
    minY = Math.min(minY, block.y);
    minZ = Math.min(minZ, block.z);
    maxX = Math.max(maxX, block.x);
    maxY = Math.max(maxY, block.y);
    maxZ = Math.max(maxZ, block.z);
  }

  const sizeX = maxX - minX + 1;
  const sizeY = maxY - minY + 1;
  const sizeZ = maxZ - minZ + 1;
  const volume = sizeX * sizeY * sizeZ;

  if ([sizeX, sizeY, sizeZ].some((size) => size > MAX_AXIS) || volume > MAX_VOLUME) {
    throw new Error("A construção excede o limite inicial de 48 blocos por eixo.");
  }

  // Litematica stores X as the fastest-changing axis, then Z, then Y.
  const palette = ["minecraft:air"];
  const paletteMap = new Map([["minecraft:air", 0]]);
  const indices = Array(volume).fill(0);
  let nonAirBlocks = 0;

  for (const item of blocks) {
    const paletteIndex = ((item.y - minY) * sizeZ + (item.z - minZ)) * sizeX + (item.x - minX);
    if (item.block === "minecraft:air") {
      indices[paletteIndex] = 0;
      continue;
    }

    if (!paletteMap.has(item.block)) {
      paletteMap.set(item.block, palette.length);
      palette.push(item.block);
    }
    indices[paletteIndex] = paletteMap.get(item.block);
    nonAirBlocks += 1;
  }

  const paletteEntries = palette.map((blockName) =>
    compoundPayload([
      tagString("Name", blockName),
      tagCompound("Properties", [])
    ])
  );

  const now = Date.now();
  const metadata = tagCompound("Metadata", [
    tagString("Name", name || "CraftBase Construction"),
    tagString("Author", "CraftBase"),
    tagString("Description", description || "Construção gerada pelo CraftBase."),
    tagInt("RegionCount", 1),
    tagInt("TotalVolume", volume),
    tagInt("TotalBlocks", nonAirBlocks),
    tagLong("TimeCreated", now),
    tagLong("TimeModified", now),
    coordinateCompound("EnclosingSize", sizeX, sizeY, sizeZ)
  ]);

  const region = tagCompound("CraftBase", [
    tagList("BlockStatePalette", 10, paletteEntries),
    tagLongArray("BlockStates", packPaletteIndices(indices, palette.length)),
    tagList("TileEntities", 10, []),
    tagList("Entities", 10, []),
    tagList("PendingBlockTicks", 10, []),
    tagList("PendingFluidTicks", 10, []),
    coordinateCompound("Position", 0, 0, 0),
    coordinateCompound("Size", sizeX, sizeY, sizeZ)
  ]);

  const root = Buffer.concat([
    Buffer.from([10]),
    nbtString(""),
    tagInt("Version", 7),
    tagInt("SubVersion", 1),
    tagInt("MinecraftDataVersion", 4440),
    metadata,
    tagCompound("Regions", [region]),
    Buffer.from([0])
  ]);

  return {
    file: gzipSync(root),
    name: sanitizeFilename(name),
    dimensions: { x: sizeX, y: sizeY, z: sizeZ },
    volume,
    totalBlocks: nonAirBlocks,
    paletteSize: palette.length
  };
}

export default function handler(req, res) {
  if (setCors(req, res)) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Envie um objeto JSON válido." });
    }

    const result = buildLitematic(body);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${result.name}.litematic"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-CraftBase-Size", `${result.dimensions.x}x${result.dimensions.y}x${result.dimensions.z}`);
    res.setHeader("X-CraftBase-Block-Count", String(result.totalBlocks));
    return res.status(200).end(result.file);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Não foi possível gerar o arquivo."
    });
  }
}
