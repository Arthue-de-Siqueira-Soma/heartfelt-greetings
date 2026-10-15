# CraftBase — configuração inicial do backend

Esta etapa adiciona uma API Node.js compatível com Vercel. Ela não substitui o site estático publicado no GitHub Pages: a API pode ser implantada na Vercel separadamente, e o site chamará a URL do backend.

## Endpoints

- `GET /api/health` — verifica se a API está respondendo.
- `POST /api/analyze` — recebe `{ "idea": "...", "version": "1.21.8", "imageDataUrl": "data:image/png;base64,..." }` e solicita à IA uma análise da captura de tela, sem gerar arquivo.
- `POST /api/generate` — recebe uma lista explícita de blocos com coordenadas e devolve um arquivo `.litematic`. Veja `docs/GENERATOR_API.md`.
- `POST /api/create` — recebe ideia + imagem + versão, pede à IA um plano de blocos vanilla e devolve um `.litematic`. Veja `docs/AI_BUILD_API.md`.

## Implantar na Vercel

1. Entre em https://vercel.com/ e importe o repositório `Arthue-de-Siqueira-Soma/minecraft`.
2. Use a raiz do projeto como **Root Directory**.
3. Em **Settings → Environment Variables**, adicione:
   - `OPENAI_API_KEY`: sua chave secreta da API OpenAI.
   - `CRAFTBASE_ALLOWED_ORIGINS`: `https://arthue-de-siqueira-soma.github.io`
   - Opcional: `OPENAI_VISION_MODEL`: `gpt-4.1-mini`
4. Faça o deploy e teste `https://SEU-DOMINIO.vercel.app/api/health`. Deve retornar JSON com `"ok": true`.
5. Nunca coloque a chave da OpenAI no HTML, JavaScript do navegador, GitHub Pages ou neste repositório. Cadastre-a somente como variável secreta na Vercel.
6. O site ainda precisa ser configurado para chamar a URL real da Vercel. Enquanto o backend não estiver implantado e a URL não estiver ligada ao formulário, o site publicado não consegue executar a análise/geração.

## Custos e segurança

A API OpenAI é faturada separadamente da assinatura ChatGPT e pode gerar custos. Defina limites e monitore consumo antes de usar com frequência. O endpoint `/api/create` limita pedidos a 3 por minuto por IP na memória, mas isso é apenas uma proteção de melhor esforço; antes de abrir ao público, adicionar rate limiting compartilhado, autenticação e monitoramento.

## Limitações

- A imagem é encaminhada à IA para análise, mas não é salva em armazenamento persistente por esta implementação.
- A construção gerada é um schematic local de até 24×24×24, com até 2.000 blocos vanilla em estado padrão.
- A IA não consegue determinar coordenadas exatas do terreno nem blocos ocultos a partir de uma única captura. O jogador posiciona manualmente o schematic com Litematica.
- A saída pode conter imperfeições. O arquivo deve ser validado no Litematica/Minecraft antes de ser considerado confiável.
- GitHub Pages hospeda arquivos estáticos; não executa a API Node.js.
