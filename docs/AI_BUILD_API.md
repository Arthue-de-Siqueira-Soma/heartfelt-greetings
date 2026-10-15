# CraftBase — geração de construções por IA

## Novo endpoint

`POST /api/create` recebe `{ "idea": "...", "version": "1.21.8", "imageDataUrl": "data:image/png;base64,..." }`, analisa a imagem com a IA, pede um plano JSON de blocos vanilla e transforma o plano em um arquivo `.litematic` para download.

A API usa o endpoint Responses da OpenAI com entrada de texto e imagem e saída JSON estruturada. Consulte a documentação oficial: https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses

## Limites e comportamento

- Máximo aproximado de 2,8 MB para a imagem, 2.000 caracteres para a ideia e 600 blocos por construção.
- A construção fica limitada a uma caixa local de 24×24×24 blocos.
- Esta versão gera arquivos para Minecraft Java 1.21.8 (DataVersion 4440). Outras versões ainda não são aceitas.
- Coordenadas do schematic são locais, começando em (0,0,0); o jogador posiciona a construção no mundo usando Litematica.
- A imagem ajuda a entender o contexto visual, mas não fornece coordenadas exatas nem revela blocos ocultos. Esta versão não encaixa automaticamente o projeto no relevo.
- Só aceita IDs de blocos vanilla `minecraft:...` e estado padrão. Estados especiais (por exemplo, orientação de escadas, portas e slabs) ainda não são suportados.
- O modelo pode produzir projetos imperfeitos; revise no Litematica e teste em um mundo separado antes de usar em um mundo importante.
- O endpoint precisa de `OPENAI_API_KEY` no backend e de hospedagem Node.js, como Vercel. Não funciona apenas no GitHub Pages.
- O limite por IP é de melhor esforço e em memória; antes de uso público, configure rate limiting compartilhado, autenticação e monitoramento de custos.

## Exemplo de entrada

```json
{
  "idea": "Faça uma pequena base medieval de madeira e pedra, com torre e telhado",
  "version": "1.21.8",
  "imageDataUrl": "data:image/png;base64,..."
}
```

A resposta bem-sucedida é um arquivo binário `.litematic`, não JSON. Em caso de erro, a API responde JSON com a propriedade `error`.

## Outros endpoints

- `GET /api/health` — verifica se o backend responde.
- `POST /api/analyze` — análise textual/visual sem geração de arquivo.
- `POST /api/generate` — gera um schematic a partir de uma lista explícita de blocos. Veja este arquivo: `GENERATOR_API.md`.
