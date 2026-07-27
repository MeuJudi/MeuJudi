# Raspador — PDPJ-Br / Jus.br (achado que pode mudar a prioridade do projeto)

> **Status: RASCUNHO / PESQUISA — não pronto para implementar.**
> Pesquisa feita em 27/07/2026, disparada por um redirecionamento
> inesperado do TJPI (seção 5 de `raspador-tribunais-pendentes.md`) pra
> um portal nacional. Este documento é sobre esse achado especificamente
> — a arquitetura geral, os documentos por sistema e a lista de
> tribunais continuam em seus próprios arquivos.

---

## 1. O que é o PDPJ-Br / Jus.br

**PDPJ-Br** (Plataforma Digital do Poder Judiciário Brasileiro) é uma
iniciativa do CNJ (Resolução 335/2020) pra integrar os sistemas de
processo eletrônico do país (PJe, e-Proc, e outros) — funciona como
**plataforma de integração/message broker**, não como banco de dados
próprio que substitui os sistemas de cada tribunal.

**Jus.br** é o **Portal de Serviços** voltado pro usuário final
(advogado, parte, cidadão) construído em cima do PDPJ-Br — instituído
pela **Resolução CNJ 455/2022**, que obriga adesão de todos os tribunais
e a criação de:
- consulta unificada,
- peticionamento inicial e intercorrente,
- comunicações processuais eletrônicas,
- acesso por login único.

## 2. Cobertura

- **212 fontes de dados, de 93 órgãos do Judiciário** conectados.
- Adesão **obrigatória por resolução do CNJ** — não é opcional pros
  tribunais.
- Ressalva: adesão não é 100% completa em todas as funcionalidades pra
  todos os órgãos ainda (o próprio CNJ cita Domicílio Judicial
  Eletrônico, DJEN e peticionamento intercorrente como não universais)
  — "conectado" não significa "tudo funcionando" em todo lugar.
- Tribunais confirmados migrando/integrando em 2026: TJPR, TJMG, TJSC,
  TJAC (produção), TRF3 e TJRN (ajustes finais).

## 3. Como funciona o login

Confirmado por manuais oficiais (TRT1, TRT6): o acesso ao PJe via PDPJ
aceita **3 métodos**:
1. **Certificado digital** (Cert A1) + segundo fator por e-mail
2. Conta **gov.br nível Ouro** (exige biometria facial pelo app) + 2FA
   pelo app
3. CPF/senha já cadastrado no PJe + 2FA por e-mail

**Achado importante**: o Cert A1 continua sendo um método válido de
login — **o MeuJudi CS já sabe fazer esse login hoje** (é o mesmo fluxo
que usa pro PJe, em `pje-auth.ts`). Não seria necessário construir uma
integração OAuth/gov.br nova do zero — só apontar o fluxo de login que já
existe pra URL nova do PDPJ.

(Existe também uma API OAuth 2.0 oficial de "Login Único gov.br"
documentada em `acesso.gov.br/roteiro-tecnico`, pra quem quisesse
integrar via gov.br de verdade — mas exige adesão formal do órgão/empresa
junto ao governo, burocracia parecida com credenciais de MNI. Não
necessária se o caminho do Cert A1 funcionar.)

## 4. Confirmado: um login dá acesso a vários tribunais na mesma tela

Texto oficial do CNJ sobre o Jus.br:

> *"O Portal de Serviços permitirá à advocacia, promotoria e defensoria
> públicas, além de qualquer parte cadastrada, consultar em um único
> endereço eletrônico o andamento de processos ou comunicações
> processuais e peticionar em ações judiciais. A partir de um login
> único, integrado ao Gov.Br, será possível acessar informações dos
> diferentes sistemas processuais."*

Isso não é só uma tela de login compartilhada — é **consulta processual
unificada de verdade**, entre tribunais diferentes, na mesma sessão.

## 5. Por que isso pode ser mais valioso que continuar tribunal por tribunal

Comparado ao raspador público (scraping anônimo, sem login) que
desenhamos nos outros documentos:

| | Raspador público (e-SAJ/eproc/Projudi/PJe) | PDPJ/Jus.br via Cert A1 |
|---|---|---|
| Precisa resolver captcha/WAF por tribunal | Sim, caso a caso (TJMG, TJAM, TRF5...) | Não — é login legítimo, não scraping |
| Cobertura | 1 adaptador por sistema, config por tribunal | Potencialmente 93 órgãos com 1 integração |
| Dado retornado | Metadado público + decisão pública (quando linkada) | **Processo completo**, incluindo petições — porque o advogado está logado como parte de verdade, não visitante público |
| Esforço de implementação | 4 adaptadores diferentes + exceções por tribunal | Reaproveita o login Cert A1 que o CS já tem |
| Escopo | Pode incluir "descobrir por OAB de terceiro" (parcialmente) | Só processos onde o advogado logado é parte |

Pro objetivo real do MeuJudi (alimentar o sistema com dado completo dos
processos **dos próprios clientes**), essa segunda via parece
estrategicamente melhor — maior cobertura, dado mais completo, menos
peça nova de código.

## 6. O que ainda não está confirmado

- Não consegui abrir a tela de consulta de fato nesta sessão (bloqueada
  tanto no navegador quanto no fetch direto) — tudo acima vem de
  documentação oficial e manuais de tribunal, não de teste ao vivo.
- Não sei ainda **exatamente qual URL/endpoint** o CS chamaria depois do
  login (se é a mesma UI que um humano usaria, ou se existe uma API
  JSON por trás, como achamos no PJe comum via TJDFT).
- Não confirmei se a "consulta unificada" realmente traz processos de
  **todos** os 93 órgãos aderidos, ou só dos que o advogado já tem
  processo ativo/vínculo formal.
- Não testei se esse login altera ou substitui o fluxo de Cert A1 que o
  CS já tem pro PJe hoje, ou se seria um fluxo paralelo novo.

## 7. Próximos passos

1. Testar manualmente (Caio) o acesso ao Jus.br com um Cert A1 real, pra
   confirmar: entra direto, mostra processos de mais de um tribunal,
   mostra petição/documento completo.
2. Se confirmado, repetir a técnica de interceptação de rede (mesma do
   TJDFT) **depois de logado**, pra achar a API JSON por trás da tela —
   isso definiria se dá pra automatizar sem abrir navegador toda vez
   (só uma vez pro login, sessão reaproveitada depois).
3. Avaliar se isso vira prioridade **acima** de continuar corrigindo
   tribunal por tribunal (TJRR, TJAM, TRF5) — pode tornar boa parte
   desse trabalho redundante.
4. Confirmar com a Julia se usar a sessão logada do próprio advogado
   (via CS) pra automatizar consulta muda alguma coisa do ponto de vista
   jurídico — tende a ser mais simples que os outros casos (é o próprio
   advogado acessando o próprio processo, mesmo raciocínio do Cert A1
   que já está em produção), mas vale confirmar.
