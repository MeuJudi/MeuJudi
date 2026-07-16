# 16 — Plano de Implementação do MeuJudi CS (v3)

> **Nome do app:** MeuJudi CS (CS = Cert Service)
> **Executável:** `MeuJudi-CS.exe` | **Instalador:** `MeuJudi-CS-Setup.exe`
> **Package name:** `meujudi-cs`
> **Pasta no Windows:** `C:\Users\{user}\AppData\Local\Programs\meujudi-cs\`
> **Tray icon tooltip:** `MeuJudi CS`
> **User-Agent:** `MeuJudi-CS/1.0 (compatible; Electron)`
> **Status:** 📋 Pronto para executar
> **Duração estimada:** 10 dias úteis (2 semanas)
> **Dependência:** [`09-cert-a1.md`](09-cert-a1.md) (arquitetura) + [`14-plano-teste-cert-a1.md`](14-plano-teste-cert-a1.md) (validação HARs)

---

## 🎯 Objetivo

Implementar o **cert. A1 Service** (módulo do MeuJudi Electron) que:

1. Faz login no PJe via **OAuth-like window** (cert. A1 ou gov.br)
2. Roda polling automático (1x/hora) via **HTTP puro** (29 endpoints REST)
3. Baixa PDFs de peças e extrai campos via **regex + Claude Haiku**
4. Detecta audiências estruturadas e prazos via **regex + IA**
5. Mantém **LGPD-compliance** (criptografia, anonimização, audit logs)

---

## 📅 Roadmap de execução (4 sprints, 10 dias)

```
Sprint 1: Login OAuth-like        → Dias 1-3
Sprint 2: Polling + Download      → Dias 4-6
Sprint 3: Extração PDF + IA        → Dias 7-8
Sprint 4: LGPD + Piloto            → Dias 9-10
```

---

## 🏃 Sprint 1: Login OAuth-like (dias 1-3)

### Dia 1 — Setup Electron + Next.js

**Tarefa:** Criar estrutura do app Electron com tray icon + Next.js renderer.

**Entregáveis:**
- `package.json` com dependências (Electron, Next.js, electron-store, etc)
- `tsconfig.json` configurado
- `src/main/index.ts` (entry point do Electron)
- `src/main/tray.ts` (ícone na bandeja do Windows)
- `src/renderer/` (app Next.js com layout básico)
- Build scripts (`npm run dev`, `npm run build`, `npm run dist`)

**Comandos:**
```bash
# Criar projeto
mkdir meujudi-cert-service
cd meujudi-cert-service
npm init -y

# Instalar deps
npm install electron electron-store electron-builder
npm install next react react-dom typescript
npm install --save-dev @types/node @types/react
```

**Critério de aceite:**
- ✅ App roda (`npm run dev`)
- ✅ Ícone aparece na bandeja do Windows
- ✅ Janela principal abre/fecha via tray
- ✅ TypeScript compila sem erros

---

### Dia 1.5 — Tela "Conectar PJe" (UI)

**Tarefa:** Implementar a interface da tela de conexão no Next.js.

**Arquivo:** `src/renderer/pages/settings/pje-connection.tsx`

**Layout:**
```
┌─────────────────────────────────────────────┐
│  MeuJudi - Conexão com PJe                  │
│                                              │
│  ●  Conectado (expira em 7h 23m)            │
│                                              │
│  Última sincronização: 15/07/2026 14:32     │
│  Processos sincronizados: 94                │
│  Peças baixadas: 23                         │
│                                              │
│  [Renovar conexão]  [Desconectar]           │
└─────────────────────────────────────────────┘

OU (desconectado):

┌─────────────────────────────────────────────┐
│  MeuJudi - Conexão com PJe                  │
│                                              │
│  ●  Desconectado                             │
│                                              │
│  Para usar dados do PJe, precisamos que     │
│  você faça login uma vez. Seus dados ficam  │
│  salvos no seu computador, criptografados.  │
│                                              │
│  [Conectar com gov.br]                       │
│  [Conectar com Certificado A1]               │
│  [Conectar com outro PJe: ___]               │
│                                              │
│  Após conectar, o MeuJudi atualiza           │
│  automaticamente. Você não precisa           │
│  fazer login de novo até expirar.            │
└─────────────────────────────────────────────┘
```

**Critério de aceite:**
- ✅ Tela renderiza corretamente
- ✅ Botão "Conectar" dispara `window.electron.pjeAuth.showLoginWindow()`
- ✅ Status atualiza em tempo real (polling 1x/segundo no IPC)

---

### Dia 2 — PJeAuth + Login OAuth-like

**Tarefa:** Implementar a lógica de login via OAuth-like window.

**Arquivo:** `src/main/pje-auth.ts`

**Funcionalidades:**
1. `showLoginWindow()` — abre BrowserWindow interna com URL do PJe
2. Listener `did-navigate` — detecta quando login completou
3. `extractCookies()` — lê cookies via `webContents.session.cookies.get()`
4. `buildSession()` — monta objeto PJeSession com cookies + CSRF + expiração
5. `saveSession()` — criptografa e salva em electron-store
6. `getValidSession()` — recupera sessão válida (não expirada)
7. `callPJeAPI(endpoint)` — wrapper que injeta cookies + XSRF automaticamente

**Código-chave (resumido):**
```typescript
export class PJeAuth {
  private authWindow: BrowserWindow | null = null;
  private store = new Store({ name: 'pje-session', encryptionKey: this.getMachineKey() });

  async showLoginWindow(): Promise<PJeSession> {
    return new Promise((resolve, reject) => {
      this.authWindow = new BrowserWindow({
        width: 1000, height: 750,
        title: 'Conectar ao PJe',
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });

      this.authWindow.loadURL('https://pje.trt9.jus.br/pjekz/login');

      this.authWindow.webContents.on('did-navigate', async (event, url) => {
        if (url.includes('/painel/usuario-externo')) {
          const cookies = await this.authWindow.webContents.session.cookies.get({
            domain: '.pje.trt9.jus.br'
          });
          const session = this.buildSession(cookies);
          this.saveSession(session);
          this.authWindow.close();
          resolve(session);
        }
      });

      this.authWindow.on('closed', () => {
        if (!this.hasValidSession()) reject(new Error('Login cancelado'));
      });
    });
  }

  async callPJeAPI(endpoint: string): Promise<any> {
    const session = await this.getValidSession();
    if (!session) throw new Error('Não conectado ao PJe');

    const response = await fetch(`https://pje.trt9.jus.br${endpoint}`, {
      headers: {
        'Cookie': session.cookies.map(c => `${c.name}=${c.value}`).join('; '),
        'x-xsrf-token': session.csrfToken
      }
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('Sessão expirada');
    }
    return response.json();
  }
}
```

**IPC bridge (preload):**
```typescript
// src/preload/index.ts
contextBridge.exposeInMainWorld('electron', {
  pjeAuth: {
    showLoginWindow: () => ipcRenderer.invoke('pje:show-login'),
    getStatus: () => ipcRenderer.invoke('pje:status'),
    disconnect: () => ipcRenderer.invoke('pje:disconnect')
  }
});
```

**Critério de aceite:**
- ✅ Janela de login abre ao clicar "Conectar"
- ✅ Detecta automaticamente quando login completou (URL muda)
- ✅ Cookies extraídos contêm `JSESSIONID`, `XSRF-TOKEN`, `KEYCLOAK_*`
- ✅ Sessão salva criptografada em disco
- ✅ Erro 401/403 detectado e reportado

---

### Dia 2.5 — Criptografia AES-256-GCM

**Tarefa:** Criptografar cookies antes de salvar em disco.

**Arquivo:** `src/shared/crypto.ts`

**Implementação:**
```typescript
import crypto from 'crypto';
import { machineIdSync } from 'node-machine-id';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  // Chave única por máquina (não compartilhada)
  const machineId = machineIdSync();
  return crypto.scryptSync(machineId, 'meujudi-salt', 32);
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  // Formato: iv (12 bytes) + authTag (16 bytes) + encrypted
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decrypt(ciphertext: string): string {
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
```

**Critério de aceite:**
- ✅ Cookies criptografados antes de salvar em `electron-store`
- ✅ Chave baseada em `machineId` (única por PC)
- ✅ Auth tag verificado na decriptografia (detecta tampering)

---

### Dia 3 — Teste de login com cert. A1 real

**Tarefa:** Validar o fluxo OAuth-like end-to-end com o cert. A1 do Luís Fellype.

**Checklist de teste:**
- [ ] Configurar cert. A1 como padrão no Windows (1x)
- [ ] Clicar "Conectar" no MeuJudi
- [ ] Janela de login do PJe abre
- [ ] Clicar "Entrar com cert. A1"
- [ ] Windows SmartScreen mostra o cert (ou pula direto se for padrão)
- [ ] Login completa
- [ ] Painel do advogado carrega
- [ ] Janela do MeuJudi fecha sozinha
- [ ] Status muda para "Conectado"
- [ ] 1 request de teste (`pauta-usuarios-externos`) retorna dados

**Critério de aceite:**
- ✅ Login completo em < 60 segundos
- ✅ 1 endpoint de teste retorna JSON válido
- ✅ Sessão persiste após fechar/reabrir o app

---

## 🏃 Sprint 2: Polling + Download (dias 4-6)

### Dia 4 — Polling do painel do advogado

**Tarefa:** Implementar `callPJeAPI` para os endpoints do painel.

**Endpoints prioritários (Dia 4):**
- `GET /paineladvogado/{id}/processos` — lista processos
- `GET /paineladvogado/{id}/totalizadores` — totais
- `GET /pauta-usuarios-externos` — audiências
- `GET /quadroavisos/` — avisos

**Arquivo:** `src/main/pje-poller.ts`

**Estrutura:**
```typescript
export class PJePoller {
  private auth: PJeAuth;
  private intervalId: NodeJS.Timer | null = null;

  start() {
    this.intervalId = setInterval(() => this.tick(), 60 * 60 * 1000); // 1h
    this.tick(); // primeira vez imediato
  }

  async tick() {
    const session = await this.auth.getValidSession();
    if (!session) return;

    // 1. Buscar lista de processos
    const processos = await this.auth.callPJeAPI(
      `/pje-comum-api/api/paineladvogado/${session.userId}/processos?pagina=1&tamanhoPagina=100&tipoPainelAdvogado=1&ordenacaoCrescente=false&idPainelAdvogadoEnum=1`
    );

    // 2. UPSERT no Supabase
    await this.syncProcessos(processos.resultado);

    // 3. Buscar pauta de audiências
    const hoje = new Date();
    const amanha = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);
    const pauta = await this.auth.callPJeAPI(
      `/pje-comum-api/api/pauta-usuarios-externos?dataInicio=${formatDate(hoje)}&dataFim=${formatDate(amanha)}&codigoSituacao=M&numeroPagina=1&tamanhoPagina=50&ordenacao=asc`
    );

    // 4. UPSERT audiências
    await this.syncAudiencias(pauta.resultado);
  }
}
```

**Critério de aceite:**
- ✅ Polling roda a cada 1h
- ✅ 94 processos do Luís Fellype capturados
- ✅ Audiências estruturadas salvas no Supabase
- ✅ Diff detection (só atualiza o que mudou)

---

### Dia 4.5 — Sincronização com Supabase

**Tarefa:** UPSERT dos dados do PJe no Supabase.

**Estrutura de dados (tabela `processos`):**
```sql
create table processos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  id_pje bigint not null,                    -- id interno do PJe
  cnj text not null,                          -- "0001909-16.2025.5.09.0652"
  classe_judicial text,                       -- "ATOrd"
  orgao_julgador text,                        -- "18ª VARA DO TRABALHO DE CURITIBA"
  nome_parte_autora text,                     -- do JSON
  nome_parte_re text,                         -- do JSON
  segredo_justica boolean default false,      -- do JSON
  juizo_digital boolean default false,        -- do JSON
  data_autuacao timestamptz,                  -- do JSON
  data_arquivamento timestamptz,              -- do JSON
  status text,                                -- do JSON
  -- Campos do PDF (preenchidos depois)
  valor_causa numeric(15,2),                  -- regex na Petição Inicial
  cpf_autor text,                             -- regex
  cnpj_reu text,                              -- regex
  oab_advogado text,                          -- regex
  endereco_autor text,                        -- regex
  endereco_reu text,                          -- regex
  -- Auditoria
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  ultima_sync_pje timestamptz
);
```

**Critério de aceite:**
- ✅ UPSERT idempotente (não duplica processos)
- ✅ RLS por tenant_id (advogado A não vê do B)
- ✅ updated_at automático (trigger)

---

### Dia 5 — Download de peças (PDF)

**Tarefa:** Implementar download de PDFs via `pje-consulta-api`.

**Arquivo:** `src/main/pje-downloader.ts`

**Endpoints:**
- `GET /pje-consulta-api/api/processos/{idProcesso}/documentos/{idDocumento}?tokenCaptcha={token}` (peça individual)
- `GET /pje-comum-api/api/processos/id/{idProcesso}/documentos/agrupados?processoCompleto=true` (PDF consolidado)

**Lacuna conhecida:** o endpoint que lista IDs de peças de 1 processo não foi mapeado. Solução temporária: usar o `documentos/agrupados` (PDF de 35 MB) que tem TUDO.

**Implementação:**
```typescript
export class PJeDownloader {
  async downloadPeca(idProcesso: number, idDocumento: number, tokenCaptcha: string): Promise<Buffer> {
    const session = await this.auth.getValidSession();
    const url = `https://pje.trt9.jus.br/pje-consulta-api/api/processos/${idProcesso}/documentos/${idDocumento}?tokenCaptcha=${tokenCaptcha}`;
    
    const response = await fetch(url, {
      headers: {
        'Cookie': cookieHeader(session),
        'x-xsrf-token': session.csrfToken,
        'Referer': `https://pje.trt9.jus.br/consultaprocessual/detalhe-processo/${cnj}/1`
      }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async downloadPDFConsolidado(idProcesso: number): Promise<Buffer> {
    // Workaround: pega o PDF com todas as peças
    const session = await this.auth.getValidSession();
    const url = `https://pje.trt9.jus.br/pje-comum-api/api/processos/id/${idProcesso}/documentos/agrupados?processoCompleto=true`;
    
    const response = await fetch(url, { headers: { /* ... */ } });
    return Buffer.from(await response.arrayBuffer());
  }
}
```

**Critério de aceite:**
- ✅ PDF consolidado baixado (35 MB por processo)
- ✅ Salvo no Supabase Storage (cifrado)
- ✅ Mapeamento processo → arquivo PDF persistido

---

### Dia 5.5 — Downloader com peças individuais (otimização)

**Tarefa:** Quando o endpoint que lista IDs for descoberto, baixar peças individuais em vez do consolidado.

**Workaround temporário (até 1 HAR futuro):**
- Baixar só a Petição Inicial (1ª peça)
- Baixar Contestação (se houver)
- Baixar Sentença (se houver)

**Critério de aceite:**
- ✅ Petição Inicial baixada individualmente (228 KB em vez de 35 MB)
- ✅ Regex consegue extrair valor da causa, CPF, OAB

---

### Dia 6 — Cron interno + retry/backoff

**Tarefa:** Sistema roda sozinho com retry em caso de erro.

**Arquivo:** `src/main/scheduler.ts`

**Implementação:**
```typescript
export class Scheduler {
  start() {
    // Polling 1x/hora
    cron.schedule('0 * * * *', () => this.poller.tick());
    
    // Download de peças 1x/dia às 4h
    cron.schedule('0 4 * * *', () => this.downloader.syncAll());
    
    // Keepalive de sessão 1x/30min
    cron.schedule('*/30 * * * *', () => this.auth.keepAlive());
  }

  async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        const delay = Math.min(2 ** attempt * 1000, 30000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('unreachable');
  }
}
```

**Critério de aceite:**
- ✅ Polling roda automaticamente a cada 1h
- ✅ Retry com backoff exponencial (1s, 2s, 4s)
- ✅ Keepalive de sessão (evita expirar)
- ✅ Logs estruturados (sucesso/erro por tentativa)

---

## 🏃 Sprint 3: Extração PDF + IA (dias 7-8)

### Dia 7 — Parser de PDF + 10 regexs

**Tarefa:** Extrair texto do PDF e aplicar regexs validados.

**Arquivo:** `src/extractor/pdf-parser.ts` (Node puro com `pdf-parse`)

**Estrutura:**
```typescript
import pdfParse from 'pdf-parse';

export async function extrairTexto(pdfBuffer: Buffer): Promise<string> {
  const data = await pdfParse(pdfBuffer);
  return data.text;
}
```

**Arquivo:** `src/extractor/regex-fields.ts`

**10 regexs validados (do Teste4):**
```typescript
export const REGEX_FIELDS = {
  cnj: /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/,
  cpf: /\d{3}\.\d{3}\.\d{3}-\d{2}/g,
  cnpj: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,
  oab: /OAB\s*\/?\s*([A-Z]{2})\s*[\.\s]*\s*([\d\.]+)/gi,
  valorCausa: /valor\s*(?:de|da causa)?\s*[eé]?\s*de?\s*R\$[\s\n]*([\d\.]+,\d{2})/i,
  vara: /(\d+\s*VARA\s+DO\s+TRABALHO\s+DE\s+\w+)/,
  data: /Curitiba,\s*(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/,
  cep: /CEP\s*[\.:]?\s*(\d{5}[-\s]?\d{3})/,
  email: /[\w\.-]+@[\w\.-]+\.\w+/,
  telefone: /\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/g
};

export function extrairCampos(texto: string) {
  return {
    cnj: texto.match(REGEX_FIELDS.cnj)?.[0],
    cpfs: [...texto.matchAll(REGEX_FIELDS.cpf)].map(m => m[0]),
    cnpjs: [...texto.matchAll(REGEX_FIELDS.cnpj)].map(m => m[0]),
    oabs: [...texto.matchAll(REGEX_FIELDS.oab)].map(m => ({ uf: m[1], numero: m[2] })),
    valorCausa: texto.match(REGEX_FIELDS.valorCausa)?.[1],
    vara: texto.match(REGEX_FIELDS.vara)?.[0],
    data: texto.match(REGEX_FIELDS.data)?.[0],
    cep: texto.match(REGEX_FIELDS.cep)?.[1],
    email: texto.match(REGEX_FIELDS.email)?.[0],
    telefones: [...texto.matchAll(REGEX_FIELDS.telefone)].map(m => m[0])
  };
}
```

**Critério de aceite:**
- ✅ `pdf-parse` extrai texto dos 3 PDFs do Teste4 sem erro
- ✅ Todos os 10 regexs capturam dados reais (validado)
- ✅ Função `extrairCampos()` retorna objeto estruturado

---

### Dia 7.5 — Claude Haiku COM anonimização

**Tarefa:** Fallback com IA quando regex falha.

**Arquivo:** `src/extractor/ia-extractor.ts`

**Implementação:**
```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function anonimizar(texto: string): string {
  return texto
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '[CPF]')
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, '[CNPJ]')
    .replace(/OAB\s*\/\s*[A-Z]{2}\s*[\d\.]+/gi, '[OAB]')
    .replace(/Rua\s+[^,]+,\s*\d+/g, 'Rua [ENDERECO]')
    .replace(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/g, '[TEL]')
    .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '[EMAIL]')
    .replace(/(Sr\.|Sra\.|Reclamante:|Reclamada:)\s*[A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)+/g, '$1 [NOME]');
}

export async function extrairComIA(texto: string, regexResult: any): Promise<any> {
  const textoAnonimizado = anonimizar(texto);
  
  const prompt = `Analise o texto abaixo (já anonimizado) de uma peça processual brasileira e extraia em JSON:

{
  "prazos": [{"dias": 5, "tipo": "manifestacao", "data_inicio": "DD/MM/YYYY"}],
  "audiencias": [{"data": "DD/MM/YYYY", "hora": "HH:MM", "tipo": "instrucao"}],
  "intimacoes": [{"destinatario": "[NOME]", "prazo_dias": 5}]
}

Se um campo não estiver presente, retorne array vazio.

TEXTO:
${textoAnonimizado.slice(0, 3000)}`;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });
  
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { prazos: [], audiencias: [], intimacoes: [] };
}
```

**Critério de aceite:**
- ✅ Claude Haiku retorna JSON estruturado
- ✅ Anonimização remove CPF/CNPJ/OAB antes de enviar
- ✅ Custo < R$ 0,01 por análise
- ✅ Latência < 2 segundos

---

### Dia 8 — Sistema de 3 estados de regex (auto-correção)

**Tarefa:** Regex aprende com o tempo, transiciona NOVO → QUENTE → CONFIÁVEL.

**Arquivo:** `src/extractor/regex-states.ts`

**Implementação:**
```typescript
// Banco: tabela regex_metadata
// CREATE TABLE regex_metadata (
//   id uuid primary key,
//   padrao text unique,
//   estado text check (estado in ('NOVO', 'QUENTE', 'CONFIÁVEL')),
//   usos int default 0,
//   acertos int default 0,
//   ultima_validacao timestamptz
// );

export async function avaliarRegex(padrao: string, match: string, validadoPorIA: boolean): Promise<void> {
  // Incrementar contadores
  await supabase.rpc('incrementar_regex_uso', { padrao, sucesso: validadoPorIA });
  
  // Verificar se deve transicionar de estado
  const { data: regex } = await supabase
    .from('regex_metadata')
    .select('*')
    .eq('padrao', padrao)
    .single();
  
  const taxaAcerto = regex.acertos / regex.usos;
  
  if (regex.estado === 'NOVO' && regex.usos >= 50 && taxaAcerto >= 0.9) {
    await supabase.from('regex_metadata').update({ estado: 'QUENTE' }).eq('id', regex.id);
  } else if (regex.estado === 'QUENTE' && regex.usos >= 200 && taxaAcerto >= 0.98) {
    await supabase.from('regex_metadata').update({ estado: 'CONFIÁVEL' }).eq('id', regex.id);
  }
}
```

**Critério de aceite:**
- ✅ Regex NOVO transiciona pra QUENTE com 50 usos + 90% acerto
- ✅ Regex QUENTE transiciona pra CONFIÁVEL com 200 usos + 98% acerto
- ✅ Regex CONFIÁVEL valida só 1% das vezes (monitora regressão)

---

## 🏃 Sprint 4: LGPD + Piloto (dias 9-10)

### Dia 9 — Documentação LGPD

**Tarefa:** Criar termo de uso, política de privacidade, RIPD.

**Arquivos:**
- `docs/legal/termo-de-uso.md`
- `docs/legal/politica-de-privacidade.md`
- `docs/legal/inventario-de-dados.md`
- `docs/legal/ripd.md` (Relatório de Impacto à Proteção de Dados)

**Checklist:**
- [ ] Termo de uso menciona coleta via PJe/Mural/DataJud
- [ ] Política explica criptografia AES-256 + TLS
- [ ] Inventário lista todos os dados coletados + base legal
- [ ] RIPD identifica riscos (vazamento, uso indevido) + mitigações
- [ ] DPO designado (Caio no início)
- [ ] Sub-processadores listados (Supabase, Anthropic, Vercel)

**Critério de aceite:**
- ✅ Documentos prontos pra homologação
- ✅ Aceite no cadastro (checkbox obrigatório)
- ✅ Logs de auditoria funcionando

---

### Dia 9.5 — Audit logs + RLS

**Tarefa:** Implementar logs de auditoria (LGPD art. 46) + revisar RLS.

**SQL:**
```sql
-- Tabela de audit logs
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  acao text not null,                 -- 'view_processo', 'download_pdf', 'sync_pje'
  recurso text,                        -- CNJ do processo
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

-- RLS: advogado só vê seus próprios logs
alter table audit_logs enable row level security;
create policy "tenant_isolation" on audit_logs
  for all using (tenant_id = current_setting('app.tenant_id')::uuid);

-- Política de retenção: anonimiza após 90 dias
create or replace function anonimizar_logs_antigos() returns void as $$
begin
  update audit_logs
  set acao = '[ANONIMIZADO]', recurso = '[ANONIMIZADO]'
  where created_at < now() - interval '90 days';
end;
$$ language plpgsql;

-- Cron: roda todo dia às 3h
select cron.schedule('anonimizar-logs', '0 3 * * *',  $$ select anonimizar_logs_antigos() $$);
```

**Critério de aceite:**
- ✅ Cada request ao PJe loga em `audit_logs`
- ✅ RLS impede cross-tenant access
- ✅ Anonimização automática após 90 dias

---

### Dia 10 — Piloto no Luís Fellype

**Tarefa:** Instalar o app no PC do Luís Fellype e rodar por 1 dia.

**Checklist de instalação:**
- [ ] Instalar cert. A1 no Windows (se não tiver)
- [ ] Configurar cert. A1 como padrão (1x)
- [ ] Baixar MeuJudi Cert Service (.exe)
- [ ] Instalar (Next → Next → Finish)
- [ ] Clicar "Conectar PJe" no tray icon
- [ ] Fazer login com cert. A1
- [ ] Verificar status "Conectado"
- [ ] Deixar rodar 1 dia (polling 1x/hora)
- [ ] Verificar logs de auditoria
- [ ] Verificar dados sincronizados no Supabase

**Critério de aceite:**
- ✅ App roda por 24h sem crash
- ✅ 94 processos sincronizados
- ✅ 1+ PDF baixado e processado
- ✅ Audiências detectadas
- ✅ Logs limpos

---

## 📂 Estrutura final do projeto

```
meujudi-cs/  (MeuJudi CS — Cert Service)
├── src/
│   ├── main/                          # Processo principal Electron
│   │   ├── index.ts                   # Entry point
│   │   ├── tray.ts                    # Ícone na bandeja
│   │   ├── pje-auth.ts                # OAuth-like login
│   │   ├── pje-poller.ts              # Polling 1x/hora
│   │   ├── pje-downloader.ts          # Download PDFs
│   │   └── scheduler.ts               # Cron interno
│   ├── extractor/                     # Background job
│   │   ├── pdf-parser.ts              # pdf-parse
│   │   ├── regex-fields.ts            # 10 regexs validados
│   │   ├── ia-extractor.ts            # Claude Haiku + anonimização
│   │   └── regex-states.ts            # NOVO/QUENTE/CONFIÁVEL
│   ├── renderer/                      # UI Next.js
│   │   ├── pages/
│   │   │   └── settings/
│   │   │       └── pje-connection.tsx
│   │   └── components/
│   ├── preload/                       # IPC bridge
│   │   └── index.ts
│   └── shared/
│       ├── crypto.ts                  # AES-256-GCM
│       ├── types.ts                   # PJeSession, PJeProcesso
│       └── constants.ts               # URLs, timeouts
├── assets/
│   ├── icon.png                       # Logo MeuJudi (Caio vai criar versão só do escudo p/ tray)
│   └── tray-icon.png                  # 32x32 transparente (a criar)
├── installer.iss                      # Script Inno Setup (gera MeuJudi-CS-Setup.exe)
├── package.json                       # name: "meujudi-cs", productName: "MeuJudi CS"
├── tests/
│   ├── test-pdf-extraction.js         # Valida com 3 PDFs do Teste4
│   ├── test-regex-fields.js           # Cada regex isolado
│   ├── test-ia-anonimizacao.js        # Confirma LGPD
│   └── test-pje-auth-mock.js          # Mock do Electron
├── docs/
│   └── legal/
│       ├── termo-de-uso.md
│       ├── politica-de-privacidade.md
│       └── ripd.md
├── package.json
├── tsconfig.json
└── README.md
```

---

## 📊 Métricas de sucesso

| Métrica | Meta | Como medir |
|---|---|---|
| Cobertura de processos | 95%+ | 94 processos PJe + 8.650 Mural |
| Tempo de login | < 60s | Stopwatch no teste |
| Polling 1x/hora sem erro | 99% | Logs de erro |
| Custo IA/escritório/mês | < R$ 15 | Métricas da Anthropic |
| LGPD compliance | 100% | Auditoria manual |
| NPS do advogado leigo | > 8 | Pesquisa |

---

## 💰 Custos estimados

| Item | Custo/mês | Notas |
|---|---|---|
| Electron app | R$ 0 | Roda no PC do advogado |
| Supabase (storage + DB) | R$ 5-10 | ~100 MB PDFs/mês |
| Claude Haiku | R$ 3-5 | 80% regex + 20% IA |
| **Total por escritório** | **R$ 8-15** | Margem sobre R$ 99-499 |

---

## 📚 Próximo passo

Após os 10 dias:
1. Validar com 1 escritório piloto (Luís Fellype)
2. Coletar feedback do usuário leigo
3. Iterar UX da tela "Conectar PJe"
4. Implementar multi-conta (vários advogados do escritório)
5. Avaliar migração pra VPS com LLM local (quando > 30 escritórios)

---

> 📄 **Documento master:** [../Documentação/ESPECIFICACAO.md](../Documentação/ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant.
>
> **Criado em:** 15/07/2026
