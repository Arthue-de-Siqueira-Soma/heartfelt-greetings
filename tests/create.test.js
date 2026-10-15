import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBuildPlan } from "../api/create.js";

test("accepts a small vanilla build plan", () => {
  const plan = normalizeBuildPlan({
    name: "Casa inicial",
    description: "Casa de madeira",
    summary: "Uma pequena casa",
    blocks: [
      { x: 0, y: 0, z: 0, block: "minecraft:stone_bricks" },
      { x: 1, y: 0, z: 0, block: "minecraft:oak_planks" }
    ]
  });
  assert.equal(plan.name, "Casa inicial");
  assert.equal(plan.blocks.length, 2);
});

test("rejects duplicate coordinates in an AI plan", () => {
  assert.throws(() => normalizeBuildPlan({
    name: "Teste",
    blocks: [
      { x: 0, y: 0, z: 0, block: "minecraft:stone" },
      { x: 0, y: 0, z: 0, block: "minecraft:dirt" }
    ]
  }), /mesma coordenada/i);
});

test("rejects coordinates outside the safe 24-block cube", () => {
  assert.throws(() => normalizeBuildPlan({
    name: "Teste",
    blocks: [{ x: 24, y: 0, z: 0, block: "minecraft:stone" }]
  }), /24×24×24/);
});

test("rejects modded block IDs", () => {
  assert.throws(() => normalizeBuildPlan({
    name: "Teste",
    blocks: [{ x: 0, y: 0, z: 0, block: "othermod:block" }]
  }), /vanilla/i);
});

test("rejects plans with missing names or too many blocks", () => {
  assert.throws(() => normalizeBuildPlan({ blocks: [{ x: 0, y: 0, z: 0, block: "minecraft:stone" }] }), /nome/i);
  assert.throws(() => normalizeBuildPlan({
    name: "Teste",
    blocks: Array.from({ length: 2001 }, (_, x) => ({ x: x % 24, y: Math.floor(x / 24) % 24, z: Math.floor(x / 576), block: "minecraft:stone" }))
  }), /2.000 blocos/i);
});
