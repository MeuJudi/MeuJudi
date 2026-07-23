# Guia de Setup — MeuJudi CS (Cert Service)
**Para:** Advogados que vão usar o MeuJudi CS no PC do escritório
**Tempo estimado:** 10-15 minutos
**Pré-requisito:** Ter o cert. A1 (e-CPF A1) do escritório em mãos (arquivo .pfx)

---

## 1. Instalar o cert. A1 no Windows

Se você ainda não instalou:

1. Localize o arquivo `.pfx` do seu cert. A1 (geralmente vem por email da AC OAB ou Casa da Moeda)
2. **Clique 2x** no arquivo `.pfx`
3. O Windows abre o assistente de importação:
   - **Local do certificado:** Pessoal (deixe padrão)
   - **Senha:** digite a senha que você definiu na emissão do cert
   - ⚠️ **IMPORTANTE:** marque "**Marcar esta chave como exportável**"
   - **Catálogo de certificados:** Pessoal
   - Concluir

**Verificar se instalou certo:**
1. Pressione `Win + R` → digite `certmgr.msc` → Enter
2. Vá em **Pessoal** → **Certificados**
3. Deve aparecer seu cert. A1 com o nome "LUÍS FELLYPE DE ARAÚJO:CPF" (ou similar)

---

## 2. Instalar o MeuJudi CS

1. Abra o arquivo `MeuJudi-CS-Setup.exe` (que o Caio te mandou)
2. Wizard de instalação:
   - Next → Next → Install
   - Marque "Criar atalho na área de trabalho" (opcional)
   - Finish
3. O app **inicia automaticamente** e fica na bandeja do Windows (perto do relógio, na barra de tarefas)

⚠️ **Na primeira execução**, o app roda um **diagnóstico automático** que coleta informações sobre seu PC e envia pro Caio. Isso é normal e ajuda a garantir que tudo funciona.

---

## 3. Conectar ao PJe

1. **Clique com botão direito** no ícone do MeuJudi CS na bandeja do Windows
2. Menu de contexto aparece:
   ```
   ●  Desconectado
   ───────────────
   🔌 Conectar ao PJe
   🔄 Sincronizar agora
   ───────────────
   🔍 Executar diagnóstico
   📋 Ver logs
   ───────────────
   ❌ Sair
   ```
3. Clique em **"🔌 Conectar ao PJe"**
4. **Uma janela do PJe abre** (dentro do MeuJudi CS, não no Chrome)
5. Você vê a tela de login do PJe. Escolha uma das opções:

### Opção A: Cert. A1 (recomendado)

1. Clique em **"Certificado A1"** (ou similar)
2. **O Windows vai abrir um popup** pedindo pra escolher o cert.
3. Selecione seu cert. A1 na lista
4. ⚠️ Se aparecer opção "**Sempre usar este certificado**" ou "**Lembrar escolha**", **MARQUE**
5. Clique OK
6. O PJe autentica automaticamente
7. A janela fecha sozinha
8. Volte pro menu da bandeja → deve mostrar **"● Conectado"** (bolinha verde)

### Opção B: gov.br

1. Clique em **"gov.br"**
2. Você é redirecionado pra tela do gov.br
3. Digite seu CPF + senha
4. Autorize o PJe a acessar seus dados
5. Volte automaticamente pro PJe
6. A janela fecha quando completar
7. Menu da bandeja → **"● Conectado"**

---

## 4. Verificar se funcionou

### Opção A: Pelo menu da bandeja
- Bolinha **verde** = conectado ✅
- Bolinha **amarela** = conectando 🟡
- Bolinha **vermelha** = erro 🔴

### Opção B: Abrir a janela de status
1. Clique 2x no ícone do MeuJudi CS na bandeja
2. Ou clique com botão direito → "Configurações de conexão" (se disponível)
3. Deve aparecer:
   - **● Conectado** (verde)
   - **Tribunal:** TRT9
   - **ID do usuário:** (seu id do PJe)
   - **Expira em:** 7h 23m (por exemplo)

### Opção C: Rodar diagnóstico
1. Menu da bandeja → **"🔍 Executar diagnóstico"**
2. Aguarde ~5 segundos
3. Aparece uma janela com o resultado:
   - ✅ Cert. A1 encontrado (com seu CPF)
   - ✅ PJe acessível
   - ✅ Cookies salvos
   - Total de erros: 0

---

## 5. Se algo der errado

### Popup do cert. A1 não apareceu
- O cert. pode não ter sido instalado corretamente
- Volte pro passo 1 e reinstale o cert. A1
- Se persistir, entre em contato com o Caio

### Erro "Sessão expirada"
- Normal depois de 8-24h
- Clique em "Conectar" de novo
- Login leva ~30 segundos

### App não inicia
- Verifique se o ícone aparece na bandeja (perto do relógio)
- Se não aparecer, procure no menu Iniciar por "MeuJudi CS"
- Se persistir, reinstale o app

### Outros erros
- Menu da bandeja → **"📋 Ver logs"** → veja o erro
- Envie print do erro pro Caio

---

## 6. Após conectar (uso normal)

- **O app fica em background** (você nem vê)
- A cada 1 hora, ele consulta o PJe automaticamente
- Você **não precisa fazer nada** até a sessão expirar
- Quando expirar, aparece notificação: "Sessão PJe expirou"

---

## 7. Desinstalar (quando precisar)

1. Configurações do Windows → Aplicativos → "MeuJudi CS"
2. Desinstalar
3. (Opcional) Deletar `C:\Users\SeuNome\AppData\Roaming\meujudi-cs\` (dados locais)

---

## 8. Dúvidas?

- **Caio (desenvolvedor):** [seu telefone/email]
- **Suporte técnico:** [link do grupo/email]

---

## 9. Dados coletados (LGPD)

O app coleta e envia **apenas**:
- Versão do app e do Windows
- Se o cert. A1 foi detectado (não a senha)
- Se o PJe está acessível
- Métricas de timing (login, polling)
- Lista de erros (sem dados sensíveis)

**NÃO coleta:**
- Senha do cert. A1
- Conteúdo dos processos
- Dados de clientes
- Cookies de sessão (mantidos só localmente criptografados)

Todos os dados ficam criptografados no seu PC e são deletados quando você desinstala o app.
