# CraftBase — API inicial do gerador .litematic

## Endpoint

`POST /api/generate`

Recebe JSON com blocos e coordenadas explícitas e devolve um arquivo binário `.litematic` como download.

Exemplo de corpo:

```json
{
  "name": "Mini plataforma",
  "description": "Exemplo inicial de teste",
  "blocks": [
    { "x": 0, "y": 0, "z": 0, "block": "minecraft:stone" },
    { "x": 1, "y": 0, "z": 0, "block": "minecraft:stone" },
    { "x": 0, "y": 0, "z": 1, "block": "minecraft:oak_planks" },
    { "x": 1, "y": 0, "z": 1, "block": "minecraft:oak_planks" }
  ]
}
```

## Limites da primeira versão

- Até 50.000 entradas de bloco.
- Dimensões máximas de 48 blocos por eixo.
- Identificadores de blocos vanilla, por exemplo `minecraft:stone`.
- Coordenadas inteiras e sem duplicatas.
- Os blocos usam seu estado padrão; propriedades específicas como direção de escadas ainda não são aceitas.
- A versão NBT inicial usa formato Litematica v7/SubVersion 1 e DataVersion 4440 (Minecraft Java 1.21.8). Teste o arquivo no seu perfil de Minecraft/Litematica antes de confiar em construções importantes.

## O que esta etapa faz e não faz

Este endpoint é um gerador real a partir de uma lista de blocos com coordenadas. Ele ainda **não interpreta imagens, não escolhe automaticamente a construção e não gera uma casa completa a partir de um texto**. O próximo passo será testar e validar o arquivo produzido; depois conectaremos a análise da IA a um plano estruturado de blocos.

## Implantação e segurança

A API precisa ser executada em um ambiente backend Node.js, como a Vercel. GitHub Pages só hospeda arquivos estáticos e não executa este endpoint. Não é necessária uma chave da OpenAI para testar apenas a geração a partir de coordenadas. Não coloque chaves secretas no site nem no repositório.
