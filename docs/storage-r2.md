# Configurando o Cloudflare R2

> 🇬🇧 [English version](storage-r2.en.md)


R2 é o storage **recomendado** do LinkVault. Tem free tier generoso (10 GB de storage e 1M de Class A operations por mês), sem cobrança de egress, e é a opção mais simples de configurar pra quem quer sync entre dispositivos sem self-hosting.

> ⏱️ Tempo estimado: **5 minutos**.
> 💸 Custo: **R$ 0,00** dentro do free tier (suficiente para uso pessoal/familiar).

---

## 1. Pré-requisitos

- Conta na [Cloudflare](https://dash.cloudflare.com/sign-up) (pode ser conta gratuita)
- Cartão de crédito cadastrado (não é cobrado dentro do free tier, mas é exigido pra ativar o R2)

---

## 2. Ativar o R2 (uma vez por conta)

1. Entra no [dashboard da Cloudflare](https://dash.cloudflare.com).
2. No menu lateral, clica em **R2 Object Storage**.
3. Se for a primeira vez, vai aparecer **"Get started with R2"** pedindo pra adicionar método de pagamento. Cadastra o cartão.
4. Aceita os termos.

Pronto. Agora você tem acesso ao R2.

---

## 3. Criar o bucket

1. Em **R2 Object Storage**, clica em **Create bucket**.
2. **Bucket name**: escolhe um nome único (vale só pra você — sugestão: `linkvault-<seu-nome>`, ex: `linkvault-heric`).
   - Apenas letras minúsculas, números e hífens. Sem ponto.
3. **Location**: deixa em **Automatic** (ou escolhe a região mais próxima — `EEUR` para Europa, `WNAM` para América do Norte, etc).
4. **Default storage class**: deixa em **Standard**.
5. Clica **Create bucket**.

> 🔒 O bucket é **privado por default** — perfeito. Nunca habilite acesso público em LinkVault.

Anote o **nome do bucket** (vai precisar daqui a pouco).

---

## 4. Pegar o Account ID

1. Volta pra tela inicial do R2 (**R2 Object Storage** no menu).
2. No canto superior direito, ou no painel lateral, vai ter **Account ID** — uma string tipo `a1b2c3d4e5f67890abcdef1234567890`.
3. **Copia esse valor.** Vai compor o endpoint.

O endpoint final é:

```
https://<accountid>.r2.cloudflarestorage.com
```

Exemplo: `https://a1b2c3d4e5f67890abcdef1234567890.r2.cloudflarestorage.com`

---

## 5. Criar API Token (Access Key + Secret)

1. Ainda em **R2 Object Storage**, no menu lateral procura **API** ou **Manage API Tokens**.
   - Em alguns layouts: **R2** → **Overview** → **Manage R2 API Tokens** (canto direito).
2. Clica **Create API Token**.
3. **Token name**: algo como `LinkVault-Desktop`.
4. **Permissions**: **Object Read & Write** (não precisa de Admin).
5. **Specify bucket(s)**: marca **Apply to specific buckets only** e seleciona o bucket que você criou. (Mais seguro do que dar acesso à conta inteira.)
6. **TTL**: deixa **Forever** (ou um tempo bem longo — pra revogar você apaga o token depois).
7. Clica **Create API Token**.

A Cloudflare vai mostrar uma tela com:

```
Access Key ID:        ••••••••••••••••••••••••
Secret Access Key:    ••••••••••••••••••••••••••••••••••••••••••••
Endpoint:             https://<accountid>.r2.cloudflarestorage.com
```

> ⚠️ **A Secret Access Key aparece UMA VEZ.** Se você fechar a tela sem copiar, vai precisar criar um novo token. Copia agora.

---

## 6. Configurar no LinkVault

1. Abre o LinkVault → ícone de **Configurações** no canto superior direito.
2. Em **Storage**, troca **Tipo de storage** para **Cloudflare R2**.
3. Preenche:

| Campo                 | Valor                                                    |
| --------------------- | -------------------------------------------------------- |
| Endpoint (R2)         | `https://<accountid>.r2.cloudflarestorage.com`           |
| Region                | `auto`                                                   |
| Bucket                | nome do bucket (passo 3)                                 |
| Access Key ID         | da tela do passo 5                                       |
| Force path-style URLs | já vem marcado pra R2, deixa como está                   |
| Secret Access Key     | da tela do passo 5 (aparece uma vez!)                    |

4. Clica **Testar conexão**. Deve mostrar **"Conectou"** em verde.
5. Clica **Salvar storage**.
6. Volta pra home e salva um bookmark de teste.

Pronto. A partir de agora, todo bookmark salvo aparece no seu bucket R2.

---

## Verificando que está funcionando

No dashboard da Cloudflare → R2 → seu bucket → aba **Objects**, você deve ver após salvar o primeiro bookmark:

```
.index.json
bookmarks/
   bkm_01HXXXXXXX.md
   bkm_01HXXXXXXX.meta.json
```

Pode baixar qualquer arquivo direto pelo dashboard pra inspecionar.

---

## Trocar de máquina / usar em outro dispositivo

Como os dados moram no R2 (não no app), basta instalar o LinkVault em outra máquina e configurar com **as mesmas credenciais**. Os bookmarks aparecem automaticamente.

---

## Problemas comuns

**"InvalidAccessKeyId" ou "SignatureDoesNotMatch"** ao testar conexão:
- Você colou Access Key ID ou Secret errado. Cria um token novo (passo 5) e tenta de novo.
- Conferir que copiou sem espaço no início/fim.

**"NoSuchBucket"**:
- Nome do bucket digitado errado, ou o token tem permissão só pra outro bucket.

**"403 Forbidden"**:
- O token não tem permissão **Object Read & Write** no bucket. Recria com a permissão correta.

**Endpoint errado / connection timeout**:
- Confere o `<accountid>` no endpoint. É o Account ID da Cloudflare, não algum ID do bucket.
- Não esqueça do `https://`.

**Tudo configurado mas o app não lista os bookmarks**:
- Volta em Configurações → Storage → confirma que aparece "já salvo no keychain" no Secret. Se não aparecer, cola o secret de novo e clica Salvar.

---

## Revogando acesso

Se perder uma máquina, ou quiser parar de usar uma máquina antiga:

1. Cloudflare Dashboard → R2 → Manage API Tokens.
2. Acha o token (nome que você deu, ex: "LinkVault-Desktop").
3. Clica **Revoke**.

Próxima vez que aquela máquina tentar acessar, vai falhar com 403. Os arquivos no R2 continuam intactos.

---

## Custo realista

Para uso pessoal típico (algumas centenas de bookmarks por mês), você fica **bem dentro do free tier**:

| Limite free tier R2 | O que isso cobre                                              |
| ------------------- | ------------------------------------------------------------- |
| 10 GB de storage    | ~10 mil bookmarks com resumo de IA + transcrições de YouTube  |
| 1M Class A ops/mês  | ~1M de saves de bookmark (escritas)                           |
| 10M Class B ops/mês | ~10M de leituras (abrir bookmark, listar)                     |
| Egress ilimitado    | Nunca paga por baixar seus próprios arquivos                  |

Acima disso, é US$ 0.015/GB/mês de storage. Em prática, uso pessoal nunca passa do free tier.
