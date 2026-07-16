# 09 — cert. A1 Service (PJe + Projudi) — Arquitetura v3

> **Versão:** 3.0 (atualizada em 15/07/2026 após análise dos 5 HARs do PJe TRT9)
> **Status:** Arquitetura validada com 5 HARs reais. Pronto para implementar.
> **Prioridade:** 🔴 Alta (resolve lacunas críticas: valor da causa, CPF, OAB, audiências estruturadas)

---

## 🎯 Mudança de paradigma (v2 → v3)

**v2 (rascunho antigo):** Playwright fazendo `querySelector` em HTML — frágil, quebra a cada mudança visual do PJe.

**v3 (validada com HARs):** O PJe tem **API REST interna completa** (`pje-comum-api`, `pje-seguranca`, `pje-consulta-api`). Playwright só pra **login**; depois disso é **HTTP puro com cookies** — rápido, estável, resistente a mudanças de layout.

### Endpoints mapeados (29 do PJe TRT9)

| Microserviço | # Endpoints | Função |
|---|---|---|
| `pje-comum-api` | 24 | Painel, processos, audiências, parâmetros |
| `pje-seguranca` | 2 | Perfis, permissões |
| `pje-consulta-api` | 1 | Download de peças (PDF) |
| `primeirograu/seam/resource/rest/api/sincronia/sessao` | 1 | Keepalive |
| `sso.cloud.pje.jus.br` (Keycloak) | login | SSO centralizado (client_id: `pje-trt9-1g`) |

**Detalhes completos:** ver `Investigação/Descoberta-API-PJe-TRT9.md` (análise dos HARs).

---

## 🏗️ Arquitetura v3

```
┌──────────────────────────────────────────────────────────────┐
│  PC do Advogado                                               │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  MeuJudi Electron App (tray icon)                        │ │
│  │                                                           │ │
│  │  [1. LOGIN via OAuth-like window]                        │ │
│  │   - Abre BrowserWindow interna do Electron               │ │
│  │   - Aponta pra https://pje.trt9.jus.br/pjekz/login      │ │
│  │   - Advogado loga (gov.br OU cert. A1)                   │ │
│  │   - Detecta URL /painel/usuario-externo                  │ │
│  │   - Extrai cookies (JSESSIONID, XSRF-TOKEN, KEYCLOAK_*) │ │
│  │   - Salva criptografado (AES-256-GCM) em disco           │ │
│  │   - Fecha janela                                         │ │
│  │                                                           │ │
│  │  [2. POLLING (1x/hora) — HTTP PURO via Node fetch]      │ │
│  │   - GET pje-comum-api/api/paineladvogado/{id}/processos │ │
│  │   - GET pje-comum-api/api/pauta-usuarios-externos        │ │
│  │   - Diff com snapshot anterior → notifica mudanças       │ │
│  │                                                           │ │
│  │  [3. DOWNLOAD DE PEÇAS (on-demand) — HTTP PURO]          │ │
│  │   - GET pje-consulta-api/api/processos/{id}/             │ │
│  │         documentos/{idDoc}?tokenCaptcha={token}          │ │
│  │   - Salva PDF no Supabase Storage (cifrado)              │ │
│  │                                                           │ │
│  │  [4. EXTRAÇÃO DE CAMPOS (background job)]                │ │
│  │   - pypdf/Python extrai texto do PDF                      │ │
│  │   - Regex captura valor da causa, CPF, CNPJ, OAB, datas  │ │
│  │   - Se regex falha → Claude Haiku COM ANONIMIZAÇÃO        │ │
│  │   - UPSERT em Supabase (valor_causa, cpf_autor, etc)     │ │
│  │                                                           │ │
│  │  [5. SISTEMA DE 3 ESTADOS DE REGEX (auto-correção)]      │ │
│  │   - NOVO: 100% validado por IA                            │ │
│  │   - QUENTE: 30% validado (sampling)                       │ │
│  │   - CONFIÁVEL: 1% validado (só monitora)                 │ │
│  │   - Transição automática conforme taxa de acerto          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Windows Cert Store                                       │ │
│  │   - cert. A1 (e-CPF) do advogado                          │ │
│  │   - Configurado como padrão (1x na vida)                  │ │
│  │   - Popup do Windows SmartScreen pula direto              │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│  Supabase (Brasil, LGPD-compliant)                            │
│                                                               │
│  - processos (com id_pje, valor_causa, cpf_autor, etc)       │
│  - movimentacoes (com texto integral do PJe)                  │
│  - peca_pdf (referência + metadados extraídos)                │
│  - audit_logs (LGPD art. 46)                                  │
│  - Storage cifrado (AES-256)                                  │
│  - RLS por tenant_id                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔐 Login via OAuth-like (a peça-chave)

### Por que essa abordagem

| Opção | Pro | Contra | Veredito |
|---|---|---|---|
| **A: Manual (copiar/colar cookies)** | Simples, funciona | Advogado leigo sofre | ❌ |
| **B: Playwright com cert. A1** | Zero interação do usuário | Limitado pelo popup do Windows | ⚠️ |
| **C: CDP (usa Chrome aberto)** | Reusa Chrome do advogado | Depende de Chrome aberto | ⚠️ |
| **D: OAuth-like window no Electron** | UX perfeita, simples | Código mais complexo | ✅ **ESCOLHIDA** |

### Fluxo da Opção D (a recomendada)

```
1. Advogado clica "Conectar PJe" no MeuJudi
2. Electron abre BrowserWindow interna (1000x750, título "Conectar ao PJe")
3. Carrega https://pje.trt9.jus.br/pjekz/login
4. Advogado faz login normal (cert. A1 ou gov.br)
5. Electron monitora navegação:
   - did-navigate event → verifica se URL contém /painel/usuario-externo
   - Se sim, login completou!
6. Extrai cookies via window.webContents.session.cookies.get({ domain: '.pje.trt9.jus.br' })
7. Criptografa com AES-256-GCM (chave = machine key do Electron)
8. Salva em electron-store criptografado
9. Fecha BrowserWindow
10. MeuJudi UI atualiza: "Conectado! Expira em 7h 23m"
```

### Código-chave (resumido)

```typescript
// src/main/pje-auth.ts
import { BrowserWindow, app } from 'electron';
import Store from 'electron-store';
import crypto from 'crypto';

export class PJeAuth {
  private authWindow: BrowserWindow | null = null;
  private store = new Store({ 
    name: 'pje-session', 
    encryptionKey: this.getMachineKey()  // chave única por máquina
  });

  async showLoginWindow(): Promise<PJeSession> {
    return new Promise((resolve, reject) => {
      this.authWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        title: 'Conectar ao PJe',
        parent: BrowserWindow.getFocusedWindow(),
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });

      this.authWindow.loadURL('https://pje.trt9.jus.br/pjekz/login');

      this.authWindow.webContents.on('did-navigate', async (event, url) => {
        if (url.includes('/painel/usuario-externo')) {
          // Login feito!
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

---

## 📊 Tabela completa de endpoints (mapeados nos HARs)

### pje-comum-api (24 endpoints)

| Método | Endpoint | Função | Parâmetros |
|---|---|---|---|
| GET | `/paineladvogado/{id}/processos` | Lista processos do advogado | `pagina`, `tamanhoPagina`, `tipoPainelAdvogado`, `ordenacaoCrescente`, `idPainelAdvogadoEnum`, `data` (epoch ms) |
| GET | `/paineladvogado/{id}/totalizadores` | Cards de totais | `tipoPainelAdvogado` |
| GET | `/paineladvogado/{id}/orgaojulgadores` | Dropdown varas | `tipoPainelAdvogado` |
| GET | `/paineladvogado/{id}/classesjudiciais` | Dropdown classes | `tipoPainelAdvogado` |
| GET | `/paineladvogado/{id}/fasesprocessuais` | Dropdown fases | `tipoPainelAdvogado` |
| GET | `/pauta-usuarios-externos` | **⭐ Pauta audiências** | `dataInicio`, `dataFim`, `codigoSituacao` (M=designada), `numeroPagina`, `tamanhoPagina`, `atributoOrdenacao`, `ordenacao` |
| GET | `/processos/id/{id}/prioridades/descricao` | Prioridades legais | — |
| GET | `/processos/id/{id}/documentos/agrupados` | **PDF consolidado** | `processoCompleto` (true/false) |
| GET | `/quadroavisos/` | Avisos do painel | `pagina`, `tamanhoPagina`, `exibirApenasAvisosNaoLidos` |
| GET | `/pericias/total` | Total perícias | `prazoEntregaVencido` |
| GET | `/usuarios/fotoperfil` | Foto do usuário | — |
| GET | `/orgaosjulgadores` | Tabela referência varas | — |
| GET | `/fusohorario` | Fuso servidor | — |
| GET | `/dominio/classesjudiciais` | Domínio classes | `pautaDeAudiencias` |
| GET | `/dominio/tiposaudiencias` | Domínio tipos audiência | — |
| GET | `/dominio/situacoesaudiencias` | Domínio situações | `pautaDeAudiencias` |
| GET | `/parametros/PARAMETRO_*` (8x) | Feature flags | `opcional` |
| GET | `/parametros/sistema/producao` | Ambiente (dev/prod) | — |
| GET | `/parametros/PARAMETRO_DOWNLOAD_COMPLETO_USANDO_KZ` | Flag KZ | `opcional` |

### pje-seguranca (2 endpoints)

| Método | Endpoint | Função |
|---|---|---|
| GET | `/token/permissoes/recursos` | Permissões do usuário |
| GET | `/token/perfis` | Perfis/roles |

### pje-consulta-api (1 endpoint)

| Método | Endpoint | Função | Parâmetros |
|---|---|---|---|
| GET | `/processos/{idProcesso}/documentos/{idDocumento}` | **Download de PDF** | `tokenCaptcha` (obrigatório) |

### Backend antigo Seam/RichFaces (1 endpoint)

| Método | Endpoint | Função |
|---|---|---|
| GET | `/primeirograu/seam/resource/rest/api/sincronia/sessao` | Keepalive sessão Tomcat |

### Login (Keycloak SSO)

| URL | Função |
|---|---|
| `https://sso.cloud.pje.jus.br/auth/realms/pje/login-actions/authenticate?client_id=pje-trt9-1g` | Login Keycloak (CNJ) |

---

## 📥 Download de peças (PDF)

### Como funciona (validado nos HARs)

```typescript
// Token é reusado na mesma sessão (vimos 7 requests com mesmo token)
const url = `https://pje.trt9.jus.br/pje-consulta-api/api/processos/${idProcesso}/documentos/${idDocumento}?tokenCaptcha=${tokenCaptcha}`;

const response = await fetch(url, {
  headers: {
    'Cookie': cookieHeader,
    'x-xsrf-token': xsrfToken,
    'Referer': 'https://pje.trt9.jus.br/consultaprocessual/detalhe-processo/{cnj}/{grau}'
  }
});

// response = application/pdf (binário)
// Content-Disposition: filename="Petição Inicial.pdf"
const pdfBuffer = await response.arrayBuffer();
```

### Como mapear idProcesso + idDocumento (lacuna restante)

**Hipótese:** o frontend lista as peças em algum endpoint que não foi capturado. Precisa de 1 HAR futuro.

**Workaround temporário:** usar o `documentos/agrupados?processoCompleto=true` que retorna **PDF consolidado** com TODAS as peças. O nome do arquivo segue o padrão `{cnj}.pdf` (ex: `0001909-16.2025.5.09.0652.pdf`).

---

## 🔍 Extração de campos do PDF (regex validado)

### Campos extraíveis (testado com 3 PDFs reais do Teste4)

| Campo | Regex | Cobertura | Exemplo real |
|---|---|---|---|
| **CNJ** | `\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}` | 100% | `0001909-16.2025.5.09.0652` |
| **CPF** | `\d{3}\.\d{3}\.\d{3}-\d{2}` | 100% | `021.800.939-93` |
| **CNPJ** | `\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}` | 100% | `78.533.312/0001-58` |
| **OAB** | `OAB\s*/?\s*([A-Z]{2})\s*[\.\s]*\s*([\d\.]+)` | 100% | `OAB/PR 67.553` |
| **Valor da causa** | `valor\s*(?:de|da causa)?\s*[eé]?\s*de?\s*R\$[\s\n]*([\d\.]+,\d{2})` | 100% | `R$ 34.080,48` |
| **Vara** | `(\d+\s*VARA\s+DO\s+TRABALHO\s+DE\s+\w+)` | ⚠️ parcial | (vem do JSON) |
| **Data** | `Curitiba,\s*(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})` | 100% | `27 de novembro de 2025` |
| **CEP** | `CEP\s*[\.:]?\s*(\d{5}[-\s]?\d{3})` | 100% | `80220-010` |
| **Email** | `[\w\.-]+@[\w\.-]+\.\w+` | 100% | `juridico@plansul.net.br` |
| **Telefone** | `\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}` | 100% | `(41) 9237-5575` |

### Pipeline de extração

```typescript
// 1. Download PDF
const pdfBytes = await downloadPeca(idProcesso, idDocumento);

// 2. Extrai texto (Node com pdf-parse OU Python com pypdf)
const texto = await extrairTexto(pdfBytes);

// 3. Regex captura campos
const dados = {
  cnj: extrairCNJ(texto),
  cpfAutor: extrairCPF(texto),
  cnpjReu: extrairCNPJ(texto),
  oab: extrairOAB(texto),
  valorCausa: extrairValorCausa(texto),
  data: extrairData(texto)
};

// 4. Fallback com Claude Haiku (se regex falhou)
if (!dados.cpfAutor || !dados.cnpjReu) {
  const dadosIA = await extrairComIA(texto, dados);  // Claude Haiku COM anonimização
  Object.assign(dados, dadosIA);
}

// 5. UPSERT no Supabase
await supabase.from('processos').upsert({
  id_pje: idProcesso,
  cnj: dados.cnj,
  valor_causa: dados.valorCausa,
  cpf_autor: dados.cpfAutor,
  cnpj_reu: dados.cnpjReu,
  oab_advogado: dados.oab,
  // ...
});
```

---

## 🤖 Sistema de IA + Regex (arquitetura em 5 camadas)

### Camadas (igual ao Mural, mas pro PJe)

```
[Texto da peça PDF]
   ↓
[CAMADA 1: Regex múltiplos]           → rápido, grátis (80% cobertura)
   ↓
[CAMADA 2: Validação de consistência] → R$ 0 (cruza com dados conhecidos)
   ↓
[CAMADA 3: IA Confirmadora Haiku]    → R$ 0,002/análise (cobre mais 15%)
   ↓
[CAMADA 4: Auto-correção de Regex]    → aprende novos padrões
   ↓
[CAMADA 5: IA Sonnet (raro)]          → R$ 0,01/análise (edge cases)
```

### Sistema de 3 estados dos regex

```typescript
// Banco: tabela regex_metadata
{
  padrao: 'prazo.*?(\\d+)\\s*dias?',
  estado: 'CONFIÁVEL',  // NOVO | QUENTE | CONFIÁVEL
  usos: 1247,
  acertos: 1239,        // 99.4%
  ultima_validacao: '2026-07-15'
}

// Transições:
// NOVO → QUENTE: 50 usos com >90% acerto
// QUENTE → CONFIÁVEL: 200 usos com >98% acerto
// CONFIÁVEL: valida 1% das vezes (monitora regressão)
```

### Anonimização ANTES de mandar pra IA (LGPD-safe)

```typescript
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
```

---

## 📁 Estrutura do projeto (revisada)

```
meujudi-cs/  (MeuJudi CS — Cert Service, app separado)
├── src/
│   ├── main/                          # Processo principal Electron
│   │   ├── pje-auth.ts                # OAuth-like window + cookies
│   │   ├── cookie-store.ts            # AES-256-GCM storage
│   │   ├── pje-api.ts                 # Cliente HTTP puro (29 endpoints)
│   │   ├── pje-downloader.ts          # Download de peças PDF
│   │   └── scheduler.ts               # Cron interno
│   ├── extractor/                     # Background job (Node + Worker Threads)
│   │   ├── pdf-parser.ts              # pdf-parse (Node puro)
│   │   ├── regex-fields.ts            # 10 regexs validados
│   │   ├── ia-extractor.ts            # Claude Haiku COM anonimização
│   │   ├── regex-states.ts            # Sistema NOVO/QUENTE/CONFIÁVEL
│   │   └── auto-correction.ts         # Salva novos regex candidatos
│   ├── renderer/                      # UI (Next.js ou React)
│   │   └── pages/
│   │       └── settings/
│   │           └── pje-connection.tsx # Tela "Conectar PJe"
│   ├── preload/                       # Bridge IPC seguro
│   └── shared/
│       ├── crypto.ts                  # AES-256-GCM
│       ├── types.ts                   # PJeSession, PJeProcesso, etc
│       └── constants.ts               # URLs, timeouts
├── tests/
│   ├── test-pdf-extraction.js         # Testa com 3 PDFs do Teste4
│   ├── test-regex-fields.js           # Valida cada regex isolado
│   ├── test-ia-anonimizacao.js        # Confirma que anonimização é eficaz
│   └── test-pje-auth-mock.js          # Mock do Electron
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔄 Roadmap de implementação (10 dias)

### Sprint 1 (dias 1-3): Tela OAuth-like + Login

| Dia | Tarefa | Entrega |
|---|---|---|
| 1 | Setup Electron + Next.js | Projeto rodando com tray icon |
| 1.5 | `PJeAuth` class + BrowserWindow de login | Tela "Conectar PJe" funcional |
| 2 | Criptografia AES-256-GCM dos cookies | Sessão persistida em disco |
| 2.5 | `callPJeAPI` com fetch puro | 1 endpoint de teste (pauta) funcionando |
| 3 | Testes com cert. A1 real do Luís Fellype | Login + 1 request validado |

### Sprint 2 (dias 4-6): Polling + Download

| Dia | Tarefa | Entrega |
|---|---|---|
| 4 | Implementar `paineladvogado/.../processos` | Lista de 94 processos do Luís Fellype |
| 4.5 | Implementar `pauta-usuarios-externos` | Audiências estruturadas em JSON |
| 5 | Implementar `documentos/agrupados` (PDF) | Download de PDF consolidado |
| 5.5 | Implementar `pje-consulta-api` (peças individuais) | Download de Petição Inicial |
| 6 | Cron interno (1x/hora) + diff detection | Sistema roda sozinho |

### Sprint 3 (dias 7-8): Extração PDF + Regex + IA

| Dia | Tarefa | Entrega |
|---|---|---|
| 7 | `pdf-parser` + 10 regexs validados | Pipeline de extração funcional |
| 7.5 | `ia-extractor` COM anonimização | Claude Haiku retorna JSON estruturado |
| 8 | Sistema de 3 estados (NOVO/QUENTE/CONFIÁVEL) | Auto-correção de regex |

### Sprint 4 (dias 9-10): LGPD + Testes piloto

| Dia | Tarefa | Entrega |
|---|---|---|
| 9 | Documentação LGPD (termo, política, RIPD) | Pronto pra homologação |
| 9.5 | Audit logs + RLS policies | Compliance verificado |
| 10 | Piloto no escritório do Luís Fellype | 1 escritório usando em produção |

---

## ✅ Checklist de implementação

- [ ] Setup Electron + Next.js + tray icon
- [ ] Tela "Conectar PJe" (OAuth-like window)
- [ ] `PJeAuth` class com detecção de login feito
- [ ] Criptografia AES-256-GCM dos cookies
- [ ] `callPJeAPI` (fetch puro com cookies)
- [ ] Implementar 29 endpoints do PJe
- [ ] pdf-parser com 10 regexs
- [ ] Claude Haiku COM anonimização
- [ ] Sistema de 3 estados de regex
- [ ] Audit logs (LGPD art. 46)
- [ ] Documentação LGPD (termo + política + RIPD)
- [ ] Testes com 3 PDFs do Teste4
- [ ] Piloto no Luís Fellype (OAB 67553)
- [ ] Cron interno + retry/backoff
- [ ] Notificações (sessão expirou, novo processo, etc)

---

## 🛡️ Segurança e LGPD

### Conformidade LGPD

| Item | Implementação | Status |
|---|---|---|
| **Base legal** (art. 7º) | Legítimo interesse (dados públicos) + execução de contrato | ✅ |
| **Segurança** (art. 46) | Criptografia em trânsito (TLS) + repouso (AES-256) | ✅ |
| **Logs auditoria** (art. 37) | Tabela `audit_logs` no Supabase | ✅ |
| **Retenção** (art. 16) | Política de retenção (Caio definir: 5 anos?) | ⏳ |
| **Direito de acesso** (art. 18) | Endpoint de export JSON dos dados do tenant | ✅ |
| **Direito ao esquecimento** (art. 18) | Soft delete + export antes de hard delete | ⏳ |
| **Encarregado (DPO)** | Caio (início) → contratar DPO quando escalar | ⏳ |
| **Sub-processadores** | Listar: Supabase (BR), Anthropic (US com SCC), Vercel | ✅ |

### Onde os dados ficam

| Dado | Onde | Criptografia |
|---|---|---|
| Cookies PJe (sessão) | Disco do advogado (electron-store) | AES-256-GCM |
| PDFs de peças | Supabase Storage | AES-256 (default) |
| Texto extraído | Postgres (Supabase BR) | TLS + AES-256 |
| Logs de auditoria | Postgres (Supabase BR) | TLS + AES-256 |
| Texto enviado pra Claude | API Anthropic (US) | TLS + anonimização |

---

## 💰 Custos (estimativa por escritório)

| Item | Custo/mês | Notas |
|---|---|---|
| Electron app (host) | R$ 0 | Roda no PC do advogado |
| Supabase (storage + DB) | ~R$ 5-10 | 100-300 MB PDFs/mês |
| Claude Haiku (extração) | ~R$ 3-5 | 80% coberto por regex |
| **Total por escritório** | **R$ 8-15** | Margem saudável vs R$ 99-499 do plano |

---

## 📚 Próximo passo

Ver [`16-implementacao-cert-a1.md`](16-implementacao-cert-a1.md) para o plano de execução detalhado.

---

> 📄 **Documento master:** [../Documentação/ESPECIFICACAO.md](../Documentação/ESPECIFICACAO.md) — todas as decisões em um único arquivo.
>
> 🏢 **MeuJudi é uma vertical** (meujudi) do monorepo multi-tenant. Estrutura: `verticals` → `tenants` → `users` → dados específicos.
>
> **Atualizado em:** 15/07/2026 após validação com 5 HARs reais do PJe TRT9.
