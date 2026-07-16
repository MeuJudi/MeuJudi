# 13 — Integração MCP (Model Context Protocol)

> Dependências: Fases 01-12
> Duração estimada: 3-4 dias
> Prioridade: 🟡 Média (diferencial competitivo)

---

## 🎯 Objetivo

Permitir que **IAs externas** (Claude Desktop, ChatGPT, Gemini) conectem-se ao MeuJudi via **MCP (Model Context Protocol)** para:
- Consultar processos do escritório
- Buscar movimentações
- Criar anotações
- Listar clientes
- Ver agenda
- E muito mais

A IA vira um "assistente" que pode agir sobre os dados do escritório.

---

## 🤖 O que é MCP

**Model Context Protocol** é um protocolo aberto (criado pela Anthropic em 2024) que padroniza como IAs se conectam a ferramentas externas. É como um "USB-C" pra IAs.

```
[IA externa] ←─ MCP ─→ [Seu servidor MCP] ←→ [Seu banco Supabase]
(Claude, GPT)              (MeuJudi)
```

### Por que é importante

- **Cliente conecta sua IA ao MeuJudi** (não precisa de API key)
- IA pode **ler e agir** sobre dados do escritório
- Tudo com **autenticação e auditoria**
- Funciona com Claude Desktop, ChatGPT, Gemini, Cursor, etc.

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cliente (Advogado)                         │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Claude Desktop  │  │  ChatGPT Plus    │  ← IA do cliente     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
│           │                     │                                │
│           │ MCP (stdio)         │ MCP (stdio)                   │
│           │                     │                                │
└───────────┼─────────────────────┼────────────────────────────────┘
            │                     │
            ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Seu servidor MCP (MeuJudi)                       │
│                                                                  │
│  Endpoint: https://mcp.meujudi.com.br                            │
│  Auth: OAuth 2.0 (cliente autentica com email/senha)            │
│                                                                  │
│  Tools disponíveis:                                              │
│  ├── listar_processos                                           │
│  ├── buscar_processo(cnj)                                       │
│  ├── listar_movimentacoes(cnj)                                  │
│  ├── listar_comunicacoes_mural(cnj)                            │
│  ├── listar_agenda(periodo)                                     │
│  ├── buscar_cliente(nome)                                       │
│  ├── criar_anotacao(cnj, texto)                                 │
│  ├── listar_tarefas(usuario)                                    │
│  ├── marcar_tarefa_concluida(id)                               │
│  ├── resumo_processo(cnj)                                       │
│  └── buscar_jurisprudencia(query)  [futuro]                    │
│                                                                  │
│  Resources (dados contextuais):                                 │
│  ├── meu_escritorio()                                           │
│  ├── meus_processos()                                           │
│  └── minha_agenda()                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │     Supabase          │
                  │  (RLS por tenant)     │
                  └──────────────────────┘
```

---

## 📦 Estrutura

```
meujudi-mcp/  (projeto separado)
├── src/
│   ├── index.ts              # Entry point MCP
│   ├── server.ts             # Servidor MCP
│   ├── auth/
│   │   ├── oauth.ts          # OAuth 2.0
│   │   └── tokens.ts         # Gerenciar tokens
│   ├── tools/
│   │   ├── processos.ts      # listar, buscar, resumo
│   │   ├── movimentacoes.ts  # listar
│   │   ├── mural.ts          # listar
│   │   ├── clientes.ts       # buscar
│   │   ├── agenda.ts         # listar
│   │   ├── anotacoes.ts      # criar
│   │   └── tarefas.ts        # listar, concluir
│   ├── resources/
│   │   ├── escritorio.ts     # contexto
│   │   ├── processos.ts
│   │   └── agenda.ts
│   ├── supabase.ts           # Cliente Supabase
│   └── logger.ts
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

## 💻 Código

### `meujudi-mcp/package.json`

```json
{
  "name": "@meujudi/mcp-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "deploy": "fly deploy"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@supabase/supabase-js": "^2.x",
    "express": "^4.x",
    "zod": "^3.x",
    "pino": "^8.x"
  },
  "devDependencies": {
    "@types/express": "^4.x",
    "tsx": "^4.x",
    "typescript": "^5.x"
  }
}
```

### `meujudi-mcp/src/index.ts`

```typescript
// Entry point do servidor MCP
// Roda via stdio (Claude Desktop) OU HTTP (ChatGPT, Gemini, etc)

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { allTools } from './tools/index.js';
import { logger } from './logger.js';

// Detectar modo (stdio ou HTTP)
const isStdio = process.env.MCP_TRANSPORT === 'stdio' || !process.env.PORT;

async function main() {
  const server = new Server(
    {
      name: 'meujudi-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Listar tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  });

  // Executar tool
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = allTools.find(t => t.name === name);

    if (!tool) {
      throw new Error(`Tool não encontrada: ${name}`);
    }

    try {
      // Extrair contexto de auth (do token)
      const context = request.meta?.authContext;
      const result = await tool.execute(args, context);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      logger.error(`Erro ao executar ${name}:`, err);
      throw err;
    }
  });

  if (isStdio) {
    // Modo stdio (Claude Desktop)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('MCP server rodando via stdio');
  } else {
    // Modo HTTP/SSE (ChatGPT, Gemini, etc)
    const port = parseInt(process.env.PORT || '3001');
    const express = (await import('express')).default;
    const app = express();

    app.get('/sse', async (req, res) => {
      const transport = new SSEServerTransport('/messages', res);
      await server.connect(transport);
    });

    app.post('/messages', async (req, res) => {
      // Handle MCP messages
    });

    app.listen(port, () => {
      logger.info(`MCP server rodando em http://localhost:${port}/sse`);
    });
  }
}

main().catch((err) => {
  logger.error('Erro fatal:', err);
  process.exit(1);
});
```

### `meujudi-mcp/src/supabase.ts`

```typescript
// Cliente Supabase com RLS por tenant
import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient(accessToken: string) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
}
```

### `meujudi-mcp/src/tools/processos.ts`

```typescript
// Tools de processos
import { z } from 'zod';
import { getSupabaseClient } from '../supabase.js';

export const listarProcessosTool = {
  name: 'listar_processos',
  description: 'Lista processos do escritório do usuário logado. Suporta filtros por status, tribunal, cliente.',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['ativo', 'suspenso', 'arquivado', 'concluido'],
        description: 'Filtrar por status do processo',
      },
      tribunal: {
        type: 'string',
        description: 'Filtrar por tribunal (ex: tjpr, tjsp, trf4)',
      },
      cliente_nome: {
        type: 'string',
        description: 'Filtrar por nome do cliente',
      },
      limite: {
        type: 'number',
        description: 'Número máximo de resultados (padrão: 50)',
        default: 50,
      },
    },
  },
  async execute(args: any, context: any) {
    const supabase = getSupabaseClient(context.accessToken);
    let query = supabase
      .from('processos')
      .select('id, cnj, classe_nome, autor, reu, status, data_ultima_movimentacao, proxima_audiencia')
      .order('data_ultima_movimentacao', { ascending: false })
      .limit(args.limite || 50);

    if (args.status) query = query.eq('status', args.status);
    if (args.tribunal) query = query.eq('tribunal', args.tribunal);
    if (args.cliente_nome) query = query.ilike('autor', `%${args.cliente_nome}%`);

    const { data, error } = await query;
    if (error) throw error;

    return {
      processos: data?.map(p => ({
        cnj: formatCnj(p.cnj),
        classe: p.classe_nome,
        autor: p.autor,
        reu: p.reu,
        status: p.status,
        ultima_movimentacao: p.data_ultima_movimentacao,
        proxima_audiencia: p.proxima_audiencia,
      })),
      total: data?.length || 0,
    };
  },
};

export const buscarProcessoTool = {
  name: 'buscar_processo',
  description: 'Busca um processo específico pelo CNJ. Retorna capa completa, partes, advogados, última movimentação.',
  inputSchema: {
    type: 'object',
    properties: {
      cnj: {
        type: 'string',
        description: 'CNJ do processo (com ou sem pontuação, 20 dígitos)',
      },
    },
    required: ['cnj'],
  },
  async execute(args: any, context: any) {
    const cnj = args.cnj.replace(/\D/g, '');
    const supabase = getSupabaseClient(context.accessToken);

    const { data: processo, error } = await supabase
      .from('processos')
      .select(`
        *,
        movimentacoes:movimentacoes(data_movimento, codigo, nome, is_novo),
        comunicacoes:comunicacoes_mural(data_disponibilizacao, tipo_comunicacao, texto),
        agenda:agenda_eventos(data_inicio, titulo, tipo)
      `)
      .eq('cnj', cnj)
      .single();

    if (error) throw error;
    if (!processo) throw new Error('Processo não encontrado');

    return {
      cnj: formatCnj(processo.cnj),
      classe: processo.classe_nome,
      autor: processo.autor,
      reu: processo.reu,
      advogados: processo.advogados,
      valor_causa: processo.valor_causa,
      tribunal: processo.tribunal,
      orgao_julgador: processo.orgao_julgador,
      data_ajuizamento: processo.data_ajuizamento,
      proxima_audiencia: processo.proxima_audiencia,
      proxima_audiencia_tipo: processo.proxima_audiencia_tipo,
      prazo_proxima_resposta: processo.prazo_proxima_resposta,
      movimentacoes_recentes: processo.movimentacoes?.slice(0, 5),
      comunicacoes_recentes: processo.comunicacoes?.slice(0, 3),
      eventos_agenda: processo.agenda?.filter((e: any) =>
        new Date(e.data_inicio) > new Date()
      ),
    };
  },
};

export const resumoProcessoTool = {
  name: 'resumo_processo',
  description: 'Gera um resumo executivo do processo em linguagem natural, usando IA. Bom pra advogado entender o processo rapidamente.',
  inputSchema: {
    type: 'object',
    properties: {
      cnj: { type: 'string' },
    },
    required: ['cnj'],
  },
  async execute(args: any, context: any) {
    // 1. Buscar dados básicos
    const processo = await buscarProcessoTool.execute(args, context);

    // 2. Chamar IA pra resumir
    const prompt = `
Resuma este processo jurídico de forma clara e objetiva:

${JSON.stringify(processo, null, 2)}

Gere um resumo de 3-5 parágrafos incluindo:
- Tipo de ação
- Partes envolvidas
- Status atual
- Última movimentação relevante
- Próximos passos / prazos
`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    return {
      resumo: data.content[0].text,
      processo_cnj: processo.cnj,
    };
  },
};

function formatCnj(cnj: string): string {
  const c = cnj.replace(/\D/g, '').padStart(20, '0');
  return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13, 14)}.${c.slice(14, 16)}.${c.slice(16, 20)}`;
}
```

### `meujudi-mcp/src/tools/movimentacoes.ts`

```typescript
import { z } from 'zod';
import { getSupabaseClient } from '../supabase.js';

export const listarMovimentacoesTool = {
  name: 'listar_movimentacoes',
  description: 'Lista movimentações recentes de um processo (ou de todos). Pode filtrar por data e por não lidas.',
  inputSchema: {
    type: 'object',
    properties: {
      cnj: {
        type: 'string',
        description: 'CNJ do processo. Se omitido, lista de todos os processos do escritório',
      },
      apenas_novas: {
        type: 'boolean',
        description: 'Listar só movimentações ainda não vistas',
        default: false,
      },
      desde: {
        type: 'string',
        description: 'Data inicial (ISO)',
      },
      limite: {
        type: 'number',
        default: 50,
      },
    },
  },
  async execute(args: any, context: any) {
    const supabase = getSupabaseClient(context.accessToken);
    let query = supabase
      .from('movimentacoes')
      .select(`
        *,
        processo:processos(cnj, classe_nome)
      `)
      .order('data_movimento', { ascending: false })
      .limit(args.limite || 50);

    if (args.apenas_novas) query = query.eq('is_novo', true);
    if (args.desde) query = query.gte('data_movimento', args.desde);

    if (args.cnj) {
      const cnj = args.cnj.replace(/\D/g, '');
      // Buscar processo_id primeiro
      const { data: proc } = await supabase
        .from('processos')
        .select('id')
        .eq('cnj', cnj)
        .single();
      if (proc) query = query.eq('processo_id', proc.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    return {
      movimentacoes: data?.map(m => ({
        processo_cnj: formatCnj((m.processo as any).cnj),
        data: m.data_movimento,
        codigo: m.codigo,
        nome: m.nome,
        orgao_julgador: m.orgao_julgador,
        is_nova: m.is_novo,
        prazo_dias: m.prazo_dias,
        prazo_fatal: m.prazo_fatal,
      })),
      total: data?.length || 0,
    };
  },
};

function formatCnj(cnj: string): string {
  const c = cnj.replace(/\D/g, '').padStart(20, '0');
  return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13, 14)}.${c.slice(14, 16)}.${c.slice(16, 20)}`;
}
```

### `meujudi-mcp/src/tools/anotacoes.ts`

```typescript
import { getSupabaseClient } from '../supabase.js';

export const criarAnotacaoTool = {
  name: 'criar_anotacao',
  description: 'Cria uma anotação interna em um processo. Útil pra salvar observações do advogado.',
  inputSchema: {
    type: 'object',
    properties: {
      cnj: { type: 'string', description: 'CNJ do processo' },
      texto: { type: 'string', description: 'Texto da anotação' },
      privado: {
        type: 'boolean',
        description: 'Se true, só o autor vê',
        default: false,
      },
    },
    required: ['cnj', 'texto'],
  },
  async execute(args: any, context: any) {
    const supabase = getSupabaseClient(context.accessToken);
    const cnj = args.cnj.replace(/\D/g, '');

    // Buscar processo_id
    const { data: proc } = await supabase
      .from('processos')
      .select('id')
      .eq('cnj', cnj)
      .single();

    if (!proc) throw new Error('Processo não encontrado');

    const { data, error } = await supabase
      .from('anotacoes_processo')
      .insert({
        tenant_id: context.tenant_id,
        processo_id: proc.id,
        user_id: context.user_id,
        texto: args.texto,
        is_privado: args.privado || false,
      })
      .select()
      .single();

    if (error) throw error;
    return { sucesso: true, anotacao_id: data.id };
  },
};
```

### `meujudi-mcp/src/tools/agenda.ts`

```typescript
import { getSupabaseClient } from '../supabase.js';

export const listarAgendaTool = {
  name: 'listar_agenda',
  description: 'Lista eventos da agenda (prazos + audiências) num período.',
  inputSchema: {
    type: 'object',
    properties: {
      data_inicio: { type: 'string', description: 'ISO date' },
      data_fim: { type: 'string', description: 'ISO date' },
      tipo: {
        type: 'string',
        enum: ['audiencia', 'prazo', 'reuniao', 'outro'],
      },
    },
  },
  async execute(args: any, context: any) {
    const supabase = getSupabaseClient(context.accessToken);
    let query = supabase
      .from('agenda_eventos')
      .select(`
        *,
        processo:processos(cnj, classe_nome)
      `)
      .eq('status', 'pendente')
      .order('data_inicio');

    if (args.data_inicio) query = query.gte('data_inicio', args.data_inicio);
    if (args.data_fim) query = query.lte('data_inicio', args.data_fim);
    if (args.tipo) query = query.eq('tipo', args.tipo);

    const { data, error } = await query;
    if (error) throw error;

    return {
      eventos: data?.map(e => ({
        id: e.id,
        tipo: e.tipo,
        titulo: e.titulo,
        data: e.data_inicio,
        processo_cnj: formatCnj((e.processo as any)?.cnj || ''),
        local: e.local,
      })),
      total: data?.length || 0,
    };
  },
};

function formatCnj(cnj: string): string {
  const c = cnj.replace(/\D/g, '').padStart(20, '0');
  return `${c.slice(0, 7)}-${c.slice(7, 9)}.${c.slice(9, 13)}.${c.slice(13, 14)}.${c.slice(14, 16)}.${c.slice(16, 20)}`;
}
```

### `meujudi-mcp/src/tools/index.ts`

```typescript
import { listarProcessosTool, buscarProcessoTool, resumoProcessoTool } from './processos.js';
import { listarMovimentacoesTool } from './movimentacoes.js';
import { criarAnotacaoTool } from './anotacoes.js';
import { listarAgendaTool } from './agenda.js';

export const allTools = [
  // Processos
  listarProcessosTool,
  buscarProcessoTool,
  resumoProcessoTool,

  // Movimentações
  listarMovimentacoesTool,

  // Anotações
  criarAnotacaoTool,

  // Agenda
  listarAgendaTool,
];
```

---

## 🔐 Autenticação

### OAuth 2.0 Flow

O MCP usa **OAuth 2.0** pra autenticar o cliente:

```
1. Cliente (Claude) abre MCP server
2. MCP server retorna URL de autorização
3. Cliente redireciona usuário pra https://meujudi.com.br/oauth/authorize
4. Usuário faz login com email/senha
5. Usuário aprova scopes (read:processos, write:anotacoes, etc)
6. MCP server recebe code, troca por access_token
7. MCP server passa access_token em cada request
8. Supabase valida token + RLS por tenant
```

### Implementação simplificada (com Supabase Auth)

```typescript
// Em meujudi-mcp/src/auth.ts
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function exchangeCodeForToken(code: string) {
  // O cliente logou no app MeuJudi e gerou um code
  // Aqui trocamos por um access_token do Supabase
  const { data, error } = await supabaseAdmin.auth.getUser(code);
  if (error) throw error;

  return {
    access_token: data.session?.access_token,
    user_id: data.user?.id,
    tenant_id: data.user?.user_metadata?.tenant_id,
  };
}

export async function validateToken(accessToken: string) {
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error) throw error;
  return {
    user_id: data.user?.id,
    tenant_id: data.user?.user_metadata?.tenant_id,
    role: data.user?.user_metadata?.role,
  };
}
```

---

## 🧪 Como o cliente usa

### Configurar no Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) ou `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "meujudi": {
      "command": "npx",
      "args": ["-y", "@meujudi/mcp-server"],
      "env": {
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_ANON_KEY": "eyJ...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

### Exemplo de uso pelo advogado

```
Advogado: "Quais audiências eu tenho essa semana?"

Claude (via MCP):
  → chama listar_agenda(data_inicio=hoje, data_fim=+7dias)
  → retorna:
    - 15/07 14:00 - Audiência - CNJ 0014336-19.2026.8.16.0182 (4º Juizado)
    - 18/07 10:00 - Audiência - CNJ 0002997-29.2023.8.16.0001 (6ª Câmara)

Advogado: "Me resume esse último processo"

Claude:
  → chama resumo_processo(cnj=0002997-29.2023.8.16.0001)
  → retorna resumo executivo em 3 parágrafos
```

---

## 🚀 Deploy (Fly.io ou Render)

### `meujudi-mcp/Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### `meujudi-mcp/fly.toml`

```toml
app = "meujudi-mcp"
primary_region = "gru"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "3001"
  MCP_TRANSPORT = "http"

[[services]]
  internal_port = 3001
  protocol = "tcp"
  [[services.ports]]
    port = 80
    [[services.ports]]
      port = 443
```

Deploy:
```bash
cd meujudi-mcp
fly launch
fly secrets set SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx ANTHROPIC_API_KEY=xxx
fly deploy
```

Endpoint: `https://meujudi-mcp.fly.dev/sse`

---

## 💰 Custo do MCP

| Item | Custo |
|---|---|
| Fly.io (Micro instance) | R$ 0 (free tier) |
| IA (Claude Haiku) | R$ 0,001 por chamada |
| **Total** | **R$ 0-5/mês** |

---

## 🛡️ Segurança

1. **OAuth 2.0** obrigatório (sem API keys expostas)
2. **Tokens têm expiração** (1 hora)
3. **Refresh tokens** rotacionados
4. **RLS do Supabase** ativa (tenant isolation)
5. **Audit log** de toda chamada MCP
6. **Rate limiting** por usuário (100 calls/hora)
7. **Scopes OAuth**: read:processos, write:anotacoes, read:agenda

---

## ✅ Checklist

- [ ] Projeto `meujudi-mcp` criado
- [ ] SDK MCP instalado (`@modelcontextprotocol/sdk`)
- [ ] Tools implementadas (listar, buscar, criar anotação)
- [ ] OAuth 2.0 funcionando
- [ ] RLS validando acesso por tenant
- [ ] Deploy em produção (Fly.io)
- [ ] Documentação de configuração pro cliente
- [ ] Teste com Claude Desktop
- [ ] Teste com ChatGPT (via HTTP)
- [ ] Rate limiting configurado
- [ ] Audit log de chamadas MCP

---

## 📚 Próximo passo

Sistema completo com MCP! Próximos passos:
- Criar landing page com instruções de configuração MCP
- Documentar pra clientes como conectar
- Marketing: "MeuJudi é a única plataforma de advocacia com MCP nativo"

---

> 📄 **Documento master:** [../../ESPECIFICACAO.md](../../ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: erticals → 	enants → users → dados específicos.
>
> 📂 **Estrutura de pastas** (multi-vertical): lib/verticals/meujudi/ (isolado), lib/verticals/game/ (futuro), migrations/meujudi/, migrations/shared/, migrations/game/.
