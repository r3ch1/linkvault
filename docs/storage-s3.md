# Configurando o Amazon S3

> 🇬🇧 [English version](storage-s3.en.md)


Use S3 se você já tem infraestrutura na AWS, precisa de SLA empresarial, ou quer integrar com outras ferramentas AWS. Para uso pessoal puro, **R2 é mais simples e mais barato** — veja [storage-r2.md](storage-r2.md).

> ⏱️ Tempo estimado: **10 minutos**.
> 💸 Custo: ~US$ 0,02/GB/mês de storage + US$ 0,09/GB de egress (1 GB de bookmarks + leituras casuais ≈ alguns centavos por mês).

---

## 1. Pré-requisitos

- Conta na [AWS](https://aws.amazon.com/) com cartão cadastrado e billing ativo
- Permissão para criar buckets S3 e usuários IAM (se for sua conta pessoal, você já tem)

---

## 2. Criar o bucket

1. AWS Console → procura **S3** → entra no serviço.
2. Clica **Create bucket**.
3. **Bucket name**: nome único globalmente (ex: `linkvault-heric-2026`). Apenas minúsculas, números, hífen.
4. **AWS Region**: escolhe a região mais próxima de você. **Anota essa região.**
   - `us-east-1` (N. Virginia), `sa-east-1` (São Paulo), `eu-west-1` (Irlanda), etc.
5. **Object Ownership**: deixa **ACLs disabled** (default).
6. **Block Public Access settings**: **deixa TUDO bloqueado** (default). LinkVault nunca precisa de acesso público.
7. **Bucket Versioning**: **Disable** (LinkVault já trata atualizações via timestamps).
8. **Encryption**: deixa **SSE-S3** (default). É grátis e cobre proteção em repouso.
9. Clica **Create bucket**.

Anote: **bucket name** e **region**.

---

## 3. Criar usuário IAM com acesso restrito

> ❌ **Não use sua chave root da AWS.** Crie um usuário IAM dedicado com permissão apenas no bucket do LinkVault.

1. AWS Console → procura **IAM** → entra.
2. **Users** → **Create user**.
3. **User name**: `linkvault-app`.
4. **Provide user access to AWS Management Console**: **NÃO** marca (esse usuário é só pra API).
5. Clica **Next**.
6. **Permissions options**: **Attach policies directly**.
7. Em **Permissions policies**, clica **Create policy** (abre nova aba).

### Criar policy customizada

Na nova aba:

1. Aba **JSON**, cola isto (substituindo `SEU-BUCKET` pelo nome real):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ListBucket",
         "Effect": "Allow",
         "Action": ["s3:ListBucket"],
         "Resource": "arn:aws:s3:::SEU-BUCKET"
       },
       {
         "Sid": "ObjectAccess",
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::SEU-BUCKET/*"
       }
     ]
   }
   ```

2. Clica **Next**.
3. **Policy name**: `linkvault-bucket-access`.
4. Clica **Create policy**.
5. Volta pra aba anterior do usuário, clica **Refresh** e procura `linkvault-bucket-access`. Marca o checkbox.
6. **Next** → **Create user**.

---

## 4. Gerar Access Key

1. Em **IAM** → **Users** → clica no `linkvault-app`.
2. Aba **Security credentials**.
3. Em **Access keys**, clica **Create access key**.
4. **Use case**: escolhe **Application running outside AWS**.
5. Marca o entendimento, clica **Next**.
6. (Opcional) Description tag: `LinkVault desktop app`.
7. **Create access key**.

A AWS mostra:

```
Access key:           AKIA••••••••••••••••
Secret access key:    ••••••••••••••••••••••••••••••••••••••••
```

> ⚠️ **A Secret access key aparece UMA VEZ.** Copia agora ou faz download do .csv. Se perder, é só deletar e criar outra.

---

## 5. Configurar no LinkVault

1. Abre LinkVault → **Configurações**.
2. Em **Storage**, troca **Tipo de storage** para **Amazon S3**.
3. Preenche:

| Campo                 | Valor                                                |
| --------------------- | ---------------------------------------------------- |
| Endpoint (opcional)   | **deixa vazio** (a AWS resolve pela region)          |
| Region                | a região do bucket (ex: `sa-east-1`)                 |
| Bucket                | nome do bucket (passo 2)                             |
| Access Key ID         | do passo 4                                           |
| Force path-style URLs | **NÃO** marca (S3 normal usa virtual-hosted)         |
| Secret Access Key     | do passo 4 (aparece uma vez!)                        |

4. **Testar conexão** → deve aparecer **"Conectou"** em verde.
5. **Salvar storage**.
6. Salva um bookmark de teste.

---

## Verificando que funciona

No console S3 → seu bucket → você deve ver após salvar o primeiro bookmark:

```
.index.json
bookmarks/
   bkm_01HXXXXXXX.md
   bkm_01HXXXXXXX.meta.json
```

---

## Problemas comuns

**"InvalidAccessKeyId" / "SignatureDoesNotMatch"**:
- Access key ou secret colados errados. Apaga a access key e cria outra (passo 4).

**"AccessDenied" ao salvar bookmark**:
- A policy está errada — confere que tem `s3:PutObject` e `s3:DeleteObject` no `arn:aws:s3:::SEU-BUCKET/*` (com `/*` no final).

**"PermanentRedirect" ou "wrong region"**:
- Region configurada não bate com a do bucket. Vai no console S3, vê a região do bucket, e atualiza no LinkVault.

**"NoSuchBucket"**:
- Nome do bucket digitado errado, ou o usuário IAM tem policy para outro bucket.

---

## Boas práticas de segurança

- **Nunca** use o access key da conta root.
- O usuário IAM deste guia tem acesso **apenas ao bucket do LinkVault** — não a outros recursos da sua conta.
- Pra revogar uma máquina (ex: notebook roubado), entra em IAM → linkvault-app → Security credentials → **Deactivate** ou **Delete** a access key. Os arquivos no bucket continuam intactos; só aquela credencial vira inválida.
- Considera ativar **MFA delete** no bucket se quiser proteção extra contra exclusão acidental (S3 → seu bucket → Properties → Bucket Versioning → ativa Versioning + MFA Delete).

---

## Custo realista

Para uso pessoal típico (~1 GB de bookmarks, leituras casuais):

| Item               | Custo aproximado/mês       |
| ------------------ | -------------------------- |
| Storage            | US$ 0,02 (1 GB × $0,023)   |
| Requests (PUT/GET) | US$ 0,01                   |
| Egress             | US$ 0,01                   |
| **Total**          | **~ US$ 0,04/mês (~R$ 0,20)** |

Em escalas pessoais o custo é dominado pelo arredondamento. R2 ainda sai mais barato (zero egress), mas se você já é AWS-first, S3 é uma opção sólida.
