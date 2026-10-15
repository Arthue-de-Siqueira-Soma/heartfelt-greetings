import { writeFileSync } from "node:fs";
import { buildLitematic } from "../api/generate.js";

const result = buildLitematic({
  name: "CraftBase Teste",
  description: "Construção mínima para validar a importação no Litematica.",
  blocks: [
    { x: 0, y: 0, z: 0, block: "minecraft:stone_bricks" },
    { x: 1, y: 0, z: 0, block: "minecraft:stone_bricks" },
    { x: 2, y: 0, z: 0, block: "minecraft:stone_bricks" },
    { x: 0, y: 0, z: 1, block: "minecraft:oak_planks" },
    { x: 1, y: 0, z: 1, block: "minecraft:oak_planks" },
    { x: 2, y: 0, z: 1, block: "minecraft:oak_planks" },
    { x: 0, y: 0, z: 2, block: "minecraft:stone_bricks" },
    { x: 1, y: 0, z: 2, block: "minecraft:stone_bricks" },
    { x: 2, y: 0, z: 2, block: "minecraft:stone_bricks" },
    { x: 0, y: 1, z: 0, block: "minecraft:torch" },
    { x: 2, y: 1, z: 0, block: "minecraft:torch" }
  ]
});

writeFileSync("craftbase-demo.litematic", result.file);
console.log(`Generated ${result.name}.litematic (${result.dimensions.x}x${result.dimensions.y}x${result.dimensions.z}, ${result.totalBlocks} blocks)`);
