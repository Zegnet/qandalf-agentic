# Qandalf Agentic

Plataforma de agentes inteligentes construída com NestJS e LangChain para automação de tarefas via navegador.

## Tecnologias

- NestJS
- LangChain
- Puppeteer
- OpenAI / Azure OpenAI

## Instalação

```bash
npm install
```

## Configuração

Crie um arquivo `.env` na raiz do projeto:

```env
# OpenAI (padrão)
OPENAI_API_KEY=sua-api-key
OPENAI_MODEL=gpt-4o

# OU Azure OpenAI
AZURE_OPENAI_API_KEY=sua-azure-key
AZURE_OPENAI_ENDPOINT=https://seu-endpoint.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=nome-do-deployment
AZURE_OPENAI_API_VERSION=2024-06-01-preview
```

> O sistema detecta automaticamente qual provider usar baseado nas variáveis configuradas.

## Executando

```bash
# desenvolvimento
npm run start:dev

# produção
npm run start:prod
```

## Testes

```bash
npm run test
npm run test:e2e
```
