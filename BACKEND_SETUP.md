# CraftBase — configuração inicial do backend

Esta etapa adiciona uma API Node.js compatível com Vercel. Ela não substitui o site estático publicado no GitHub Pages: a API pode ser implantada na Vercel separadamente, e o site chamará a URL do backend.

## Endpoints

- `GET /api/health` — verifica se a API está respondendo.
- `POST /api/analyze` — recebe `{ "idea": "...", "version": "1.21.8", "imageDataUrl": "data:image/png;base64,..." }` e solicita à IA uma análise da captura de tela.
- `POST /api/generate` — recebe uma lista de blocos com coordenadas explícitas e devolve um arquivo `.litematic`. Veja o formato de entrada em [`docs/GENERATOR_API.md`](docs/GENERATOR_API.md).

A API aceita JPG, PNG ou WEBP. Para evitar requisições excessivas, limita a imagem a cerca de 2,8 MB e o texto da ideia a 2.000 caracteres. A análise não gera nem promete um arquivo `.litematic`.

## Implantar na Vercel

1. Entre em https://vercel.com/ e importe o repositório `Arthue-de-Siqueira-Soma/minecraft`.
2. Como o repositório já contém arquivos de site na raiz, use a raiz do projeto como **Root Directory**. Não configure um subdiretório para a API.
3. Nas configurações do projeto, em **Settings → Environment Variables**, adicione:
   - `OPENAI_API_KEY`: sua chave secreta da API OpenAI.
   - `CRAFTBASE_ALLOWED_ORIGINS`: `https://arthue-de-siqueira-soma.github.io`
   - Opcional: `OPENAI_VISION_MODEL`: `gpt-4.1-mini`
4. Faça o deploy e teste `https://SEU-DOMINIO.vercel.app/api/health`. Deve retornar JSON com `"ok": true`.
5. Não coloque a chave da OpenAI em HTML, JavaScript do navegador, GitHub Pages ou neste repositório. Cadastre-a somente como variável secreta na Vercel.
6. Depois de implantar, configure a página do site para enviar os pedidos à URL da Vercel. Essa ligação é uma etapa separada e ainda não está feita.

## Custos e limites

O uso da API OpenAI é faturado separadamente da assinatura ChatGPT e pode gerar custos. Defina limites de uso e monitore consumo antes de divulgar o serviço publicamente.

O limite por IP nesta primeira versão é apenas uma proteção de melhor esforço, pois a memória de funções serverless pode ser reiniciada ou compartilhada de forma inconsistente. Antes de abrir para o público, adicionar rate limiting compartilhado, proteção contra abuso e monitoramento.

## Limitações desta primeira etapa

- Nenhuma imagem é armazenada pela API por esta implementação; a imagem é encaminhada ao serviço de IA para análise.
- O endpoint ainda não tem autenticação de usuário, histórico persistente nem cobrança.
- O CORS não substitui autenticação e não impede chamadas automatizadas fora do navegador.
- Ainda falta ligar o formulário do site a esta API.
- O gerador `.litematic` inicial foi adicionado, mas ainda precisa ser testado abrindo um arquivo real no Litematica antes de ser considerado validado. Ele recebe coordenadas explícitas e ainda não transforma automaticamente imagens ou texto em construções.
