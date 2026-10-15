import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { buildLitematic } from "../api/generate.js";

function readNbtString(buffer, cursor) {
  const length = buffer.readUInt16BE(cursor.offset);
  cursor.offset += 2;
  const value = buffer.toString("utf8", cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return value;
}

function readPayload(buffer, cursor, type) {
  switch (type) {
    case 1: { const v = buffer.readInt8(cursor.offset); cursor.offset += 1; return v; }
    case 2: { const v = buffer.readInt16BE(cursor.offset); cursor.offset += 2; return v; }
    case 3: { const v = buffer.readInt32BE(cursor.offset); cursor.offset += 4; return v; }
    case 4: { const v = buffer.readBigInt64BE(cursor.offset); cursor.offset += 8; return v; }
    case 5: { const v = buffer.readFloatBE(cursor.offset); cursor.offset += 4; return v; }
    case 6: { const v = buffer.readDoubleBE(cursor.offset); cursor.offset += 8; return v; }
    case 7: {
      const length = buffer.readInt32BE(cursor.offset); cursor.offset += 4;
      const v = buffer.subarray(cursor.offset, cursor.offset + length);
      cursor.offset += length;
      return v;
    }
    case 8: return readNbtString(buffer, cursor);
    case 9: {
      const childType = buffer.readUInt8(cursor.offset++);
      const length = buffer.readInt32BE(cursor.offset); cursor.offset += 4;
      const items = [];
      for (let i = 0; i < length; i += 1) items.push(readPayload(buffer, cursor, childType));
      return { type: childType, items };
    }
    case 10: {
      const value = {};
      while (true) {
        const childType = buffer.readUInt8(cursor.offset++);
        if (childType === 0) break;
        const name = readNbtString(buffer, cursor);
        value[name] = readPayload(buffer, cursor, childType);
      }
      return value;
    }
    case 11: {
      const length = buffer.readInt32BE(cursor.offset); cursor.offset += 4;
      const values = [];
      for (let i = 0; i < length; i += 1) {
        values.push(buffer.readInt32BE(cursor.offset));
        cursor.offset += 4;
      }
      return values;
    }
    case 12: {
      const length = buffer.readInt32BE(cursor.offset); cursor.offset += 4;
      const values = [];
      for (let i = 0; i < length; i += 1) {
        values.push(buffer.readBigInt64BE(cursor.offset));
        cursor.offset += 8;
      }
      return values;
    }
    default: throw new Error(`Unsupported NBT type ${type}`);
  }
}

function parseRootNbt(buffer) {
  const cursor = { offset: 0 };
  const type = buffer.readUInt8(cursor.offset++);
  assert.equal(type, 10, "NBT root must be a compound");
  assert.equal(readNbtString(buffer, cursor), "", "Litematica root name should be empty");
  const root = readPayload(buffer, cursor, 10);
  assert.equal(cursor.offset, buffer.length, "NBT parser should consume the complete file");
  return root;
}

function unpackStates(packed, count, paletteLength) {
  const bits = Math.max(2, Math.ceil(Math.log2(Math.max(2, paletteLength))));
  const mask = (1n << BigInt(bits)) - 1n;
  return Array.from({ length: count }, (_, index) => {
    const bitPosition = index * bits;
    const longIndex = Math.floor(bitPosition / 64);
    const bitOffset = bitPosition % 64;
    let value = BigInt.asUintN(64, packed[longIndex]) >> BigInt(bitOffset);
    if (bitOffset + bits > 64) {
      value |= BigInt.asUintN(64, packed[longIndex + 1]) << BigInt(64 - bitOffset);
    }
    return Number(value & mask);
  });
}

test("creates a gzip-compressed NBT schematic with expected dimensions and blocks", () => {
  const result = buildLitematic({
    name: "Mini plataforma",
    description: "Teste",
    blocks: [
      { x: 0, y: 0, z: 0, block: "minecraft:stone" },
      { x: 1, y: 0, z: 0, block: "minecraft:stone" },
      { x: 0, y: 0, z: 1, block: "minecraft:oak_planks" },
      { x: 1, y: 0, z: 1, block: "minecraft:oak_planks" }
    ]
  });

  assert.equal(result.file[0], 0x1f);
  assert.equal(result.file[1], 0x8b);
  assert.deepEqual(result.dimensions, { x: 2, y: 1, z: 2 });
  assert.equal(result.totalBlocks, 4);

  const root = parseRootNbt(gunzipSync(result.file));
  assert.equal(root.Version, 7);
  assert.equal(root.MinecraftDataVersion, 4440);
  assert.equal(root.Metadata.Name, "Mini plataforma");
  assert.equal(root.Metadata.TotalBlocks, 4);
  assert.deepEqual(root.Metadata.EnclosingSize, { x: 2, y: 1, z: 2 });

  const region = root.Regions.CraftBase;
  assert.deepEqual(region.Size, { x: 2, y: 1, z: 2 });
  const palette = region.BlockStatePalette.items.map((entry) => entry.Name);
  assert.deepEqual(palette, ["minecraft:air", "minecraft:stone", "minecraft:oak_planks"]);
  assert.deepEqual(unpackStates(region.BlockStates, 4, palette.length), [1, 1, 2, 2]);
});

test("rejects duplicate coordinates", () => {
  assert.throws(() => buildLitematic({
    blocks: [
      { x: 0, y: 0, z: 0, block: "minecraft:stone" },
      { x: 0, y: 0, z: 0, block: "minecraft:dirt" }
    ]
  }), /coordenadas duplicadas/i);
});

test("rejects unknown or modded block identifiers in the initial version", () => {
  assert.throws(() => buildLitematic({
    blocks: [{ x: 0, y: 0, z: 0, block: "othermod:custom_block" }]
  }), /minecraft:/i);
});

test("rejects dimensions above the initial axis limit", () => {
  assert.throws(() => buildLitematic({
    blocks: [
      { x: 0, y: 0, z: 0, block: "minecraft:stone" },
      { x: 48, y: 0, z: 0, block: "minecraft:stone" }
    ]
  }), /48 blocos por eixo/i);
});

test("rejects non-integer coordinates", () => {
  assert.throws(() => buildLitematic({
    blocks: [{ x: 0.5, y: 0, z: 0, block: "minecraft:stone" }]
  }), /coordenadas inteiras/i);
});
