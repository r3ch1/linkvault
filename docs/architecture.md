# LinkVault

**Bookmark Manager Pessoal com IA**
*Documento de Arquitetura Técnica — v3.0*

---

> Next.js + Tauri (Rust) · Sem banco de dados nos apps · Arquivos paralelos `.md` + `.meta.json`
> Claude · Gemini · OpenAI/Codex · OpenRouter
> Local · Cloudflare R2 · S3 · MinIO · WebDAV
> **Simples, sem teatro de segurança**

---

## Changelog

### v2.4 → v3.0 (Reset estratégico)

- **REMOVIDA criptografia end-to-end** dos bookmarks (era engenharia excessiva para o caso de uso real)
- Removidas: master password, recovery key, tela de unlock, Argon2id no app, AES-GCM no app, dupla cifragem de credenciais, flag `pending_encryption`
- Mantidas todas as outras decisões: arquivos paralelos, multi-IA, multi-storage, Android Share, portal Cloudflare, extensão Chrome, embed YouTube
- Tempo de desenvolvimento da Fase 1 caiu de 4 para 2-3 semanas
- Código estimado em ~800-1000 linhas a menos
- **Auth de portal web mantida** (login para família, com hash Argon2id da senha)

### Histórico anterior (v1.0 → v2.4)

Versões anteriores tinham foco em criptografia E2E. Após reflexão, decidiu-se que para bookmarks (conteúdo originalmente público da internet) o overhead de cripto não compensa. Caso futuro precise de cripto, o caminho está documentado nas versões anteriores.

---

## 1. Visão Geral do Projeto

LinkVault é um gerenciador de bookmarks pessoal com processamento por IA, inspirado no Karakeep, mas com filosofia Unix: sem banco de dados nos apps cliente, tudo em arquivos de texto separados, armazenamento configurável pelo usuário.

### 1.1 Princípios de Design

- **Zero-database nos apps**: cada bookmark é um par de arquivos (`.md` + `.meta.json`) independente
- **Resiliência**: perder um arquivo perde apenas um bookmark, nunca todo o sistema
- **User-owned keys**: o usuário configura suas próprias chaves de IA
- **Storage-agnostic**: local, Cloudflare R2, S3, MinIO, WebDAV
- **Share intent Android**: recebe links e áudios nativamente via Intent
- **Desktop-native via Tauri**: binário Rust leve, sem Electron
- **Web-first UI**: Next.js serve o frontend, Tauri provê o shell nativo
- **Família-friendly**: portal web com login multi-usuário (cada um com seu storage)

### 1.2 O que o App Faz

- Recebe link compartilhado (Android Share, clipboard, ou extensão Chrome)
- Recebe arquivo de áudio (Android Share Audio Intent)
- Envia conteúdo para a IA configurada pelo usuário
- IA extrai: título, resumo, tags, tipo de conteúdo, idioma
- Para YouTube: IA gera resumo do vídeo via transcrição
- Salva `.md` (conteúdo) + `.meta.json` (metadados) no storage configurado
- Interface lista todos os bookmarks com filtro por tags e busca
- Para vídeos: renderiza embed do YouTube/Vimeo na visualização
- Usuário pode ler resumo, deletar, e abrir link original

### 1.3 Modelo de Segurança Honesto

LinkVault **não é zero-knowledge**. Trata bookmarks como o que são: conteúdo originalmente público que você decidiu lembrar. As proteções existentes são:

- **TLS em trânsito**: todas as comunicações via HTTPS
- **R2/S3 buckets privados**: só sua Access Key acessa
- **OS keychain**: chaves de API e credenciais de storage protegidas pelo sistema operacional (Linux Secret Service, macOS Keychain, Windows Credential Manager)
- **Auth no portal**: hash Argon2id da senha, tokens de sessão expiráveis
- **Bindings privados na Cloudflare**: D1 e R2 só acessíveis pelo seu Worker
- **Tokens revogáveis**: extensão Chrome usa tokens que podem ser invalidados a qualquer momento

Isso é equivalente ao modelo do Karakeep, Pocket, Raindrop. **Adequado para bookmarks**.

---

## 2. Stack Tecnológica

### 2.1 Frontend / UI

| Tecnologia | Papel | Justificativa |
|---|---|---|
| Next.js 14 (App Router) | UI principal | Server Components + API routes |
| TypeScript | Linguagem | Segurança de tipos end-to-end |
| Tailwind CSS | Estilo | Zero CSS custom, consistência visual |
| shadcn/ui | Componentes | Acessível, sem opinião de estilo |
| Zustand | Estado global | Leve, sem boilerplate Redux |
| React Query | Cache/fetch | Gerencia estado de listas e mutações |

### 2.2 Backend / Runtime

| Tecnologia | Papel | Justificativa |
|---|---|---|
| Tauri v2 (Rust) | Shell nativo | Leve (~10MB vs 150MB Electron), acesso a FS |
| Next.js API Routes | Backend local | Roda dentro do Tauri ou standalone |
| Rust (core) | Operações de arquivo | Leitura/escrita performática |
| Tauri Commands | Bridge JS↔Rust | Chama funções Rust do frontend via IPC |
| Tauri Plugins | Share Intent Android | Recebe Intent nativamente |

### 2.3 IA — Provedores Suportados

| Provedor | Modelos Recomendados | Notas |
|---|---|---|
| Anthropic (Claude) | claude-haiku-4-5, claude-sonnet-4 | Melhor qualidade de resumo |
| Google Gemini | gemini-2.5-flash, gemini-2.5-pro | **Free tier generoso** (15 req/min, 1500/dia) |
| OpenAI / Codex | gpt-4o-mini, gpt-4o | Whisper para transcrição de áudio |
| OpenRouter | Qualquer modelo via API unificada | Fallback e modelos open-source |
| Whisper (API ou local) | whisper-1, whisper.cpp | Transcrição de áudio antes da IA |

### 2.4 Storage — Backends Suportados

| Backend | Sync entre dispositivos? | Caso de Uso |
|---|---|---|
| Disco local | ❌ Não | Usuário com 1 dispositivo, máxima simplicidade |
| Cloudflare R2 | ✅ Sim | Nuvem barata, sync automático (recomendado) |
| Amazon S3 | ✅ Sim | Usuários já com AWS |
| MinIO / Homelab | ✅ Sim | Self-hosted, controle total |
| WebDAV | ✅ Sim | Compatível com Joplin, Nextcloud, etc |

> ⚠️ **Aviso sobre Storage Local**: Ao escolher "Disco local", os bookmarks ficam apenas naquele dispositivo. Não há sincronização automática entre desktop e Android. Se quiser usar nos dois dispositivos com os mesmos dados, escolha um backend de nuvem.

---

## 3. Estrutura de Arquivos

### 3.1 Filosofia: Arquivos Paralelos

Cada bookmark é representado por **dois arquivos** com o mesmo prefixo:

- `.md` → o conteúdo (resumo, transcrição, key points em Markdown legível)
- `.meta.json` → os metadados (tags, url, tipo, datas, IA usada, lang)

Esta separação tem três grandes vantagens:

1. **Resiliência**: se um `.meta.json` corromper, o conteúdo do `.md` está intacto
2. **Regeneração**: o `.meta.json` pode ser reconstruído pela IA relendo o `.md`
3. **Independência**: cada bookmark é completo em si — não há dependência de um índice central

### 3.2 Estrutura de Diretórios

```
~/.linkvault/                          ← raiz configurável
├── config.json                        ← config do app (NUNCA sobe pra nuvem)
├── .index.json                        ← cache de busca (regenerável)
└── bookmarks/
    ├── bkm_01HN8X2K4M.md              ← conteúdo (Markdown)
    ├── bkm_01HN8X2K4M.meta.json       ← metadados
    ├── bkm_01HN9YZ5N3.md
    ├── bkm_01HN9YZ5N3.meta.json
    ├── bkm_01HNAB6P7Q.md
    └── bkm_01HNAB6P7Q.meta.json
```

> 💡 **Por que ULIDs em vez de slugs no nome do arquivo?** Evita: colisões quando dois sites têm título igual, problemas com caracteres especiais e Unicode em filenames, e renomeação de arquivos quando o usuário edita o título. O slug aparece apenas no `.meta.json` para busca.

### 3.3 Arquivo de Conteúdo (`.md`)

Markdown puro, focado em ser lido. Sem frontmatter — todos os metadados moram no `.meta.json` paralelo.

```markdown
# Rust Ownership Explained

## Resumo

Vídeo introdutório sobre o sistema de ownership do Rust.
O instrutor explica de forma didática como o borrow checker
funciona, com exemplos práticos de código que falha em compilar
e como corrigir os erros mais comuns.

## Pontos Principais

- Ownership é transferido, não copiado (exceto tipos Copy)
- Referências imutáveis: múltiplas simultâneas permitidas
- Referência mutável: exclusiva (sem aliasing)
- Lifetimes garantem que referências nunca sejam inválidas

## Transcrição (Resumida)

[Transcrição limpa do vídeo, gerada por Whisper + IA...]
```

### 3.4 Arquivo de Metadados (`.meta.json`)

```json
{
  "id": "bkm_01HN8X2K4M",
  "version": 1,
  "url": "https://www.youtube.com/watch?v=abc123",
  "title": "Rust Ownership Explained",
  "slug": "rust-ownership-explained",
  "type": "youtube",
  "tags": ["rust", "programming", "ownership"],
  "lang": "en",
  "created_at": "2024-01-15T14:32:00Z",
  "updated_at": "2024-01-15T14:32:00Z",
  "source": "android_share",
  "ai": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "processed_at": "2024-01-15T14:32:05Z"
  },
  "content_file": "bkm_01HN8X2K4M.md",
  "summary_preview": "Vídeo introdutório sobre o sistema de ownership..."
}
```

### 3.5 Arquivo de Índice (`.index.json`)

Cache regenerável. Se for deletado ou corrompido, o app reconstrói varrendo a pasta `bookmarks/` e lendo cada `.meta.json`. **Não é fonte de verdade.**

```json
{
  "version": 1,
  "generated_at": "2024-01-17T10:00:00Z",
  "bookmarks_count": 142,
  "by_tag": {
    "rust":        ["bkm_01HN8X2K4M", "bkm_01HN9YZ5N3"],
    "programming": ["bkm_01HN8X2K4M", "bkm_01HNAB6P7Q"]
  },
  "by_type": {
    "youtube": ["bkm_01HN8X2K4M"],
    "article": ["bkm_01HN9YZ5N3", "bkm_01HNAB6P7Q"]
  },
  "recent": [
    "bkm_01HNAB6P7Q",
    "bkm_01HN9YZ5N3",
    "bkm_01HN8X2K4M"
  ]
}
```

### 3.6 `config.json` (LOCAL ONLY)

> ⚠️ **ATENÇÃO**: O `config.json` contém suas chaves de API e credenciais de storage. Ele **NUNCA** é enviado para nuvem. Fica salvo no diretório do app no SO (via Tauri AppData) e protegido pelo OS Keychain quando possível.

```json
{
  "storage": {
    "type": "local",
    "local": {
      "path": "~/Documents/LinkVault"
    },
    "r2": {
      "account_id": "...",
      "access_key_id": "...",
      "secret_access_key": "...",
      "bucket": "linkvault"
    }
  },
  "ai": {
    "default_provider": "gemini",
    "providers": {
      "claude":     { "api_key": "sk-ant-...", "model": "claude-haiku-4-5" },
      "gemini":     { "api_key": "AIza...",    "model": "gemini-2.5-flash" },
      "openai":     { "api_key": "sk-...",     "model": "gpt-4o-mini" },
      "openrouter": { "api_key": "sk-or-...",  "model": "auto" }
    }
  },
  "ui": {
    "theme": "dark",
    "default_view": "list",
    "items_per_page": 50
  }
}
```

> 🔐 **Proteção das credenciais**: secrets sensíveis (`secret_access_key`, `api_key`) são salvos via crate `keyring` do Rust, que usa o keychain nativo do SO. O `config.json` em si só guarda referências, não valores em texto puro.

---

## 4. Fluxos Principais

### 4.1 Fluxo: Compartilhamento de Link (Android)

```
1. Usuário abre link no Chrome/YouTube/qualquer app
2. Toca em Compartilhar → seleciona LinkVault
3. Android dispara Intent ACTION_SEND (type: text/plain)
4. Tauri Plugin (Rust) intercepta o Intent
5. App abre overlay mostrando: URL recebida + spinner
6. Rust chama Next.js API Route: POST /api/process
7. API Route:
   a. Detecta tipo (YouTube, artigo, imagem)
   b. Para YouTube: busca transcrição via youtube-transcript-api
   c. Para artigos: scraping com cheerio + extrai texto principal
   d. Envia para a IA configurada com prompt especializado
   e. IA retorna: título, resumo, tags, idioma (JSON estruturado)
8. App exibe preview: título + resumo + tags sugeridas
9. Usuário pode editar tags antes de salvar
10. Confirma → Rust:
    a. Gera ID (ULID)
    b. Cria .md com conteúdo formatado
    c. Cria .meta.json com metadados
    d. Atualiza .index.json (ou cria se não existir)
11. Sincroniza com storage configurado (se não for local)
12. App fecha overlay e retorna ao app anterior
```

### 4.2 Fluxo: Compartilhamento de Áudio (Android)

```
1. Usuário compartilha arquivo .mp3/.m4a/.ogg com LinkVault
2. Intent ACTION_SEND (type: audio/*)
3. Rust salva áudio temporário em cache local
4. App exibe spinner: "Transcrevendo áudio..."
5. Envia áudio para Whisper (API ou whisper.cpp local)
6. Recebe transcrição em texto
7. Envia transcrição para IA: "Resume este conteúdo de áudio:"
8. IA retorna resumo + tags
9. Cria .md com transcrição completa + resumo
10. Cria .meta.json com type='audio'
11. Salva e sincroniza
12. Deleta cache de áudio (NÃO salva o binário, só o texto)
```

### 4.3 Fluxo: Visualização da Lista

```
1. App inicia → Rust lê config.json
2. Lê .index.json do storage configurado
3. Se .index.json não existe → varre bookmarks/ e regenera
4. Next.js renderiza lista com React Query
5. Cada card mostra: favicon, título, tipo, tags, data, preview
6. Filtros: por tag, por tipo, por data, busca full-text
7. Clique no card → carrega .md correspondente
8. Renderiza Markdown (com embed de YouTube/Vimeo se aplicável)
9. Botão "Abrir link" → abre no browser externo
10. Botão "Deletar" → remove .md + .meta.json + atualiza index + sync
```

### 4.4 Fluxo: Regeneração do Index

Se o `.index.json` for deletado ou corrompido, o app reconstrói automaticamente:

```
1. App detecta .index.json ausente/inválido
2. Lista todos os arquivos *.meta.json em bookmarks/
3. Para cada arquivo:
   a. Lê metadados
   b. Adiciona ao novo índice
4. Salva novo .index.json
5. (Operação rápida: 1000 bookmarks ≈ 200ms)
```

### 4.5 Renderização de Embeds (YouTube, Vimeo, etc)

Quando o `.meta.json` indicar tipos de mídia específicos, a UI renderiza o embed nativo do provedor antes do resumo gerado pela IA:

```jsx
// components/BookmarkDetail.tsx

function BookmarkDetail({ bookmark, markdown }) {
  return (
    <article>
      <header>
        <h1>{bookmark.title}</h1>
        <TagList tags={bookmark.tags} />
      </header>

      {bookmark.type === 'youtube' && (
        <div className="aspect-video w-full mb-6 rounded-lg overflow-hidden">
          <iframe
            src={getYouTubeEmbedUrl(bookmark.url)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      )}

      {bookmark.type === 'vimeo' && (
        <div className="aspect-video w-full mb-6 rounded-lg overflow-hidden">
          <iframe
            src={getVimeoEmbedUrl(bookmark.url)}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      )}

      <MarkdownRenderer content={markdown} />
      <BookmarkActions bookmark={bookmark} />
    </article>
  );
}

function getYouTubeEmbedUrl(url: string): string {
  const id = extractYouTubeId(url);
  return `https://www.youtube.com/embed/${id}?theme=dark`;
}

function extractYouTubeId(url: string): string {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([^&?\/]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  throw new Error('URL do YouTube inválida');
}
```

**Tipos com embed suportado:**

| Tipo | Provedor | Notas |
|---|---|---|
| `youtube` | YouTube | iframe oficial, suporta tema dark e timestamps |
| `vimeo` | Vimeo | iframe oficial |
| `twitter` ou `x` | Twitter/X | usar `react-tweet` (renderiza estático) |
| `spotify` | Spotify | iframe `embed.spotify.com` para música/podcast |

**Funcionamento offline:** o resumo da IA sempre fica disponível (vive no `.md` no storage). Sem internet, vê o resumo mas o iframe não carrega — comportamento esperado.

---

## 5. Arquitetura Detalhada

### 5.1 Diagrama de Camadas

```
┌─────────────────────────────────────────────┐
│              CAMADA DE UI                    │
│         Next.js App Router (React)           │
│       /app/page.tsx  /app/settings           │
└──────────────────┬──────────────────────────┘
                   │ fetch / React Query
┌──────────────────▼──────────────────────────┐
│            CAMADA DE API                     │
│         Next.js API Routes                   │
│  /api/process  /api/bookmarks  /api/sync     │
└──────────────────┬──────────────────────────┘
                   │ invoke() — Tauri IPC
┌──────────────────▼──────────────────────────┐
│            CAMADA RUST (Tauri)               │
│   file_system.rs   storage.rs   index.rs     │
│   config.rs   android_share.rs   sync.rs     │
└──────────┬──────────────┬───────────────────┘
           │              │
    ┌──────▼──┐    ┌──────▼──────────────────┐
    │  LOCAL  │    │    CLOUD STORAGE         │
    │   FS    │    │  R2 / S3 / MinIO / WebDAV│
    └─────────┘    └──────────────────────────┘
```

### 5.2 Estrutura do Projeto

```
linkvault/
├── src-tauri/                     ← Rust (Tauri shell)
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── file_system.rs    ← ler/escrever .md + .meta.json
│   │   │   ├── storage.rs        ← abstração local/S3/R2/WebDAV
│   │   │   ├── config.rs         ← leitura/escrita de config.json
│   │   │   ├── index.rs          ← gerar/regenerar .index.json
│   │   │   └── sync.rs           ← sync com cloud storage
│   │   └── android/
│   │       └── share_intent.rs   ← recebe Intent do Android
│   ├── tauri.conf.json
│   └── Cargo.toml
│
├── app/                           ← Next.js (App Router)
│   ├── page.tsx                  ← lista de bookmarks
│   ├── settings/page.tsx         ← configurações
│   └── api/
│       ├── process/route.ts      ← processa URL/áudio com IA
│       ├── bookmarks/route.ts    ← CRUD de bookmarks
│       └── sync/route.ts         ← trigger de sync
│
├── lib/
│   ├── ai/
│   │   ├── claude.ts             ← @anthropic-ai/sdk
│   │   ├── gemini.ts             ← @google/generative-ai
│   │   ├── openai.ts             ← openai SDK
│   │   ├── openrouter.ts         ← OpenRouter HTTP client
│   │   └── index.ts              ← factory: cria cliente da config
│   ├── storage/                  ← (proxy para Rust via invoke)
│   │   └── index.ts
│   ├── parsers/
│   │   ├── youtube.ts            ← youtube-transcript + oEmbed
│   │   ├── article.ts            ← cheerio scraper
│   │   └── audio.ts              ← whisper client
│   └── markdown.ts               ← gerar .md formatado
│
└── components/
    ├── BookmarkCard.tsx
    ├── BookmarkList.tsx
    ├── TagFilter.tsx
    └── Settings/
        ├── AISettings.tsx        ← inputs de API keys
        └── StorageSettings.tsx   ← config de storage
```

---

## 6. Prompts e Contratos de IA

### 6.1 Prompt Principal (Link/Artigo)

Enviado para a IA com o conteúdo raspado do artigo. O prompt é o mesmo para todos os providers:

```
System: Você é um assistente de curadoria de conteúdo.
        Sempre responda APENAS com JSON válido, sem markdown.

User: Analise o seguinte conteúdo e retorne:
{
  "title": "título otimizado (máx 80 chars)",
  "summary": "resumo em 3-5 parágrafos no idioma original",
  "key_points": ["ponto 1", "ponto 2", "ponto 3"],
  "tags": ["tag1", "tag2", "tag3"],   // 3-8 tags, lowercase
  "lang": "pt",                          // ISO 639-1
  "content_type": "article"              // article|tutorial|news|reference|opinion
}

CONTEÚDO:
URL: {url}
Texto: {extracted_text}
```

### 6.2 Adaptação por Provider

| Provider | Particularidade |
|---|---|
| Claude | Suporta system prompt nativamente; resposta em JSON via prompt |
| Gemini | Use `generationConfig.responseMimeType='application/json'` para forçar JSON |
| OpenAI | Use `response_format: { type: 'json_object' }` para garantir JSON |
| OpenRouter | Depende do modelo; força JSON via prompt + tente parsear |

### 6.3 Prompt YouTube

```
Analise este vídeo do YouTube e retorne JSON:
{
  "title": "...",
  "summary": "resumo detalhado com os principais conceitos",
  "key_points": [...],
  "tags": [...],
  "timestamps": [
    { "time": "00:01:30", "topic": "intro" }
  ],
  "lang": "en",
  "content_type": "video"
}

URL: {youtube_url}
Transcrição: {transcript}
```

### 6.4 Prompt Áudio

```
FLUXO: Whisper transcreve → IA estrutura

Você recebeu a transcrição de um áudio. Analise e retorne JSON:
{
  "title": "título inferido do conteúdo",
  "summary": "resumo estruturado",
  "transcript_clean": "transcrição limpa e formatada",
  "key_points": [...],
  "tags": [...],
  "lang": "pt",
  "content_type": "podcast|meeting|lecture|voice_note"
}

TRANSCRIÇÃO BRUTA:
{whisper_output}
```

---

## 7. Android — Share Intent

### 7.1 Configuração do AndroidManifest.xml

```xml
<activity android:name=".MainActivity">
  <intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LAUNCHER" />
  </intent-filter>

  <!-- receber links compartilhados -->
  <intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
  </intent-filter>

  <!-- receber arquivos de áudio -->
  <intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="audio/*" />
  </intent-filter>
</activity>
```

### 7.2 Código Rust — Lendo o Intent

```rust
// src-tauri/src/android/share_intent.rs

#[derive(serde::Serialize)]
pub struct SharePayload {
    kind: String,    // 'url' ou 'audio'
    data: String,    // URL ou path do arquivo de áudio
}

#[tauri::command]
pub fn get_share_intent(app: tauri::AppHandle) -> Option<SharePayload> {
    #[cfg(target_os = "android")]
    {
        use tauri::plugin::android::*;
        let intent = app.intent();

        if intent.action() == "android.intent.action.SEND" {
            let mime = intent.get_type().unwrap_or_default();

            if mime == "text/plain" {
                let text = intent.get_string_extra("android.intent.extra.TEXT");
                return Some(SharePayload {
                    kind: "url".into(),
                    data: text
                });
            }

            if mime.starts_with("audio/") {
                let uri = intent.get_parcelable_extra(
                    "android.intent.extra.STREAM"
                );
                let path = copy_to_cache(&app, uri);
                return Some(SharePayload {
                    kind: "audio".into(),
                    data: path
                });
            }
        }
        None
    }
    #[cfg(not(target_os = "android"))]
    { None }
}
```

### 7.3 Pareamento Desktop ↔ Android via QR Code

Para evitar que o usuário precise re-digitar manualmente endpoint, region, bucket, access key ID, secret access key, chaves de IA, etc no celular, o desktop oferece um fluxo de **pareamento por QR Code** — análogo ao WhatsApp Web ou Bitwarden mobile.

**Fluxo**:

```
DESKTOP                                          ANDROID
1. Settings → "Conectar Android"
2. Coleta config atual + secrets do
   keychain → monta payload:
   {
     "v": 1,
     "storage": StorageInit {...},
     "ai": { default, providers, keys }
   }
3. Codifica payload em QR (client-side, JS).
   QR fica oculto até "Tap to reveal".
   Timer de 60s — depois expira/regenera.
4. Mostra aviso: "Não tire screenshot.
   Não exiba em ambiente público."
                                                 5. Settings → "Importar do desktop"
                                                 6. Câmera abre via tauri-plugin-barcode-scanner
                                                 7. Lê QR → desserializa JSON
                                                 8. Tela de confirmação:
                                                    "Importar storage R2 'linkvault-heric'
                                                     e 1 chave de IA (gemini)?"
                                                    [Confirmar] [Cancelar]
                                                 9. Confirma → salva em config.json
                                                    + grava secrets no Android Keystore
10. Desktop limpa o QR ←──── beacon de sucesso
    e a tela retorna ao normal              ←─── (opcional, via mDNS/local network)
```

**Decisões de design**:

- **Sem servidor intermediário**: o QR carrega o payload completo. Não há cloud nossa envolvida no pareamento. Mantém a filosofia "secrets só vivem no keychain de cada device".
- **Single-use + TTL curto (60s)**: reduz a janela de exposição na tela. O payload exibido vira inválido após 60s mesmo sem uso (o desktop regenera/limpa).
- **Hide-by-default**: a tela mostra o card do QR borrado com botão "Tap to reveal", então o secret só fica visível quando o usuário explicitamente solicita.
- **Aviso explícito** sobre não tirar screenshot e não exibir em público.
- **Beacon de sucesso opcional**: se Android e desktop estão na mesma LAN, o Android pode mandar um broadcast UDP confirmando importação, e o desktop limpa o QR imediatamente. Sem isso, o QR só some quando o TTL expira.
- **Manual fallback**: o Android sempre permite preencher os campos à mão (mesma UI do desktop), pra usuários sem câmera ou que prefiram não usar QR.

**Modelo de ameaça**:

| Ameaça | Mitigação |
|---|---|
| Pessoa do lado lendo a senha digitada | QR só serve para câmera-na-distância-certa; texto não está visível |
| Screenshot/screen-recording por malware no desktop | Não-mitigado — mas se isso roda, o keychain já está comprometido |
| Filmagem oportunista da tela em ambiente público | Aviso explícito + Tap-to-reveal + TTL de 60s |
| Reuso de QR antigo capturado em foto | Single-use: sucesso no Android invalida o QR; expiração automática |
| MITM em LAN (beacon de sucesso) | Beacon é apenas "limpe o QR", não transmite secrets — sem risco de exfiltração |

Mesmo padrão do Bitwarden/KeePass mobile e do WhatsApp Web. Considerado **adequado para uso pessoal/familiar**.

**Stack mínima**:

- Geração de QR no desktop: `qrcode` (crate Rust) ou `qrcode` (npm) — client-side puro
- Leitura de QR no Android: `tauri-plugin-barcode-scanner` (oficial Tauri Mobile)
- Serialização: o `StorageInit` já é `Serialize + Deserialize` no Rust; basta JSON

---

## 8. Estratégia de Sincronização

### 8.1 Abstração de Storage (Rust)

```rust
// Trait que todos os backends implementam
#[async_trait]
pub trait StorageBackend: Send + Sync {
    async fn read(&self, path: &str) -> Result<Vec<u8>>;
    async fn write(&self, path: &str, data: &[u8]) -> Result<()>;
    async fn delete(&self, path: &str) -> Result<()>;
    async fn list(&self, prefix: &str) -> Result<Vec<String>>;
    async fn exists(&self, path: &str) -> Result<bool>;
}

// Implementações:
// - LocalStorage  → tokio::fs
// - S3Storage     → aws-sdk-s3 (R2, MinIO, S3)
// - WebDavStorage → reqwest + WebDAV protocol

pub fn create_storage(config: &StorageConfig)
    -> Box<dyn StorageBackend> {
    match config.kind {
        StorageKind::Local => Box::new(LocalStorage::new(&config.local.path)),
        StorageKind::R2 | StorageKind::S3 | StorageKind::MinIO
            => Box::new(S3Storage::new(config)),
        StorageKind::WebDav => Box::new(WebDavStorage::new(config)),
    }
}
```

### 8.2 Cloudflare R2 — Configuração

| Campo | Onde obter |
|---|---|
| Account ID | Dashboard Cloudflare → R2 → Overview |
| Access Key ID | R2 → Manage API Tokens → Create Token |
| Secret Access Key | Gerado junto com Access Key (mostrado uma vez) |
| Bucket Name | Nome do bucket criado no R2 |
| Endpoint | Automático: `{accountId}.r2.cloudflarestorage.com` |

> 📘 Guia passo a passo para usuários finais: [`docs/storage-r2.md`](storage-r2.md). Versão para AWS S3: [`docs/storage-s3.md`](storage-s3.md).

### 8.3 Política de Sync

- **Local**: nenhuma sync; arquivos só existem na máquina
- **Cloud**: ao salvar novo bookmark → upload imediato (`.md` + `.meta.json` + index)
- Ao deletar → remove do storage remoto + atualiza index
- Na abertura → download do `.index.json` para verificar atualizações
- Conflito (mesmo bookmark em dois dispositivos) → usa `updated_at` mais recente
- Offline → salva localmente, sync automático quando reconectar
- `config.json` **NUNCA** é sincronizado na nuvem

---

## 9. Dependências Principais

### 9.1 JavaScript / TypeScript (`package.json`)

| Pacote | Uso |
|---|---|
| `@anthropic-ai/sdk` | Claude API |
| `@google/generative-ai` | Gemini API |
| `openai` | OpenAI/Codex API |
| `cheerio` | HTML scraping de artigos |
| `youtube-transcript` | Transcrição de YouTube |
| `ulid` | Geração de IDs ordenáveis |
| `zustand` | Estado global React |
| `@tanstack/react-query` | Cache e fetch |
| `react-markdown` | Renderizar `.md` no UI |
| `react-tweet` | Embed estático de tweets |

### 9.2 Rust (`Cargo.toml`)

| Crate | Uso |
|---|---|
| `tauri` | Framework desktop/mobile |
| `tokio` | Async runtime |
| `serde` / `serde_json` | Serialização |
| `aws-sdk-s3` | Storage S3/R2/MinIO |
| `reqwest` | HTTP client (WebDAV) |
| `keyring` | OS keychain (cross-platform) — para secrets |
| `chrono` | Timestamps |
| `ulid` | Geração de IDs ordenáveis |

> 💡 **Dependências removidas vs v2.4**: `aes-gcm`, `argon2`, `rand`, `zeroize` não são mais necessárias no app cliente. Reduz superfície de ataque, simplifica build, acelera compilação.

---

## 10. Roadmap de Desenvolvimento

### Fase 1 — MVP Desktop (2-3 semanas)

- [x] Setup Next.js + Tauri v2
- [x] Estrutura de arquivos `.md` + `.meta.json` paralelos
- [x] Geração e regeneração de `.index.json`
- [x] Pipeline `processUrl` com Gemini, Claude, OpenAI e OpenRouter (link → resumo + tags) *(via `lib/processor.ts` + `lib/ai/*` chamando os providers diretamente pelo `@tauri-apps/plugin-http`; ver §10.1)*
- [x] Storage local (Rust com `tokio::fs`)
- [x] UI: lista, detalhe (com embed YouTube/Vimeo), deletar
- [x] Tela de configurações: API keys, storage local
- [x] Secrets via OS keychain (crate `keyring`)

#### 10.1 Ajuste de design feito na implementação da Fase 1

Originalmente esta fase previa **API Routes do Next.js** orquestrando IA + scraping. Em Tauri desktop a recomendação é Next.js em **static export** (sem servidor Node em runtime), então essa camada foi consolidada no client TypeScript:

- **UI** continua em Next.js (App Router, `output: "export"`).
- **Filesystem / index / config / keyring** ficam em Rust (Tauri Commands em `src-tauri/src/commands/`).
- **IA + scraping** rodam no client TS (`lib/ai/*`, `lib/parsers/*`, `lib/processor.ts`) usando `@tauri-apps/plugin-http` — que faz requisições nativas pelo Rust e bypassa CORS sem precisar de servidor Node.

O fluxo lógico do diagrama §5.1 fica idêntico; só não há mais a camada "API Routes". Quando entrarmos na **Fase 5 (Portal Web)**, essa camada volta naturalmente — agora rodando em Cloudflare Workers, não no app desktop.

### Fase 2 — Cloud Storage (1-2 semanas)

- [x] `S3StorageBackend` em Rust (`aws-sdk-s3`) — cobre AWS S3, Cloudflare R2 e MinIO via endpoint configurável
- [ ] Testar com Cloudflare R2 *(pendente: validação manual com bucket real)*
- [x] `WebDavStorageBackend` (compat com Joplin/Nextcloud) — implementado com `reqwest` + parsing PROPFIND
- [x] UI de configuração de storage com teste de conexão (`StorageSettings.tsx` + comando `storage_test_connection`)
- [x] Sync automático ao salvar/deletar — write-through nativo via `StorageBackend` trait
- [ ] Modo offline com fila de sync *(deferido para Fase 4 — exige queue persistente local + reconciliação)*
- [x] **Bônus**: migração entre storages (`storage_migrate`) — copia bookmarks de qualquer backend pro ativo, com aviso amigável quando o usuário troca de tipo e ainda tem dados no antigo

#### 10.2 Notas de implementação da Fase 2

- **Trait `StorageBackend`** (`src-tauri/src/storage/mod.rs`) define `read/write/delete/list/exists/test_connection`. Backend ativo vive num `AppState` (`Arc<RwLock<Box<dyn StorageBackend>>>`) e é reconstruído sempre que o `config.json` muda (`config_save` → `state.rebuild_backend()`).
- **Commands de bookmark** (`bookmark_save/read/delete/list_all`) ficaram backend-agnósticos: não recebem mais `storage_root` — o backend é resolvido pelo state.
- **Credenciais sensíveis** (S3 secret access key, senha WebDAV) ficam **só** no keychain do SO. O `config.json` armazena flags `has_secret`/`has_password` mas nunca o valor.
- **R2/MinIO** ativam `force_path_style: true` automaticamente. Para AWS S3 normal usa virtual-hosted style.
- **WebDAV** auto-cria diretórios faltantes via MKCOL antes de PUT. PROPFIND com `Depth: infinity` para listagem.
- **Migração de storage**: comando `storage_migrate(source: StorageInit, overwrite: bool)` instancia o backend de origem ad-hoc, copia todo `bookmarks/*` pro backend ativo (resolvido via `AppState`), pula IDs já existentes (a menos que `overwrite=true`), e regenera `.index.json` no destino. Origem nunca é alterada.

### Fase 3 — Android (2-3 semanas)

- [ ] Build Android com Tauri v2 *(código pronto; manual: rodar `tauri android init` numa máquina com Android SDK/NDK — ver [docs/android-build.md](android-build.md))*
- [x] **Pareamento Desktop ↔ Android via QR Code** (ver §7.3) — desktop gera QR efêmero com TTL 60s + tap-to-reveal + aviso; Android (ou desktop como fallback) lê com câmera via `@tauri-apps/plugin-barcode-scanner` ou cola JSON manualmente. Sem servidor intermediário. Comandos Rust: `pairing_export` / `pairing_import`.
- [ ] Share Intent para texto (links)
- [ ] Share Intent para áudio
- [ ] Integração Whisper para transcrição
- [ ] Overlay rápido de confirmação

### Fase 4 — Polimento (1-2 semanas)

- [ ] OpenRouter como provedor de IA
- [ ] OpenAI/Codex como provedor de IA
- [ ] Suporte a YouTube refinado (transcrição automática)
- [ ] Busca full-text no index
- [ ] Tema claro/escuro
- [ ] Export/import de bookmarks (`.zip` de `.md` + `.meta.json`)
- [ ] Backup automático antes de operações destrutivas

### Fase 5 — Portal Web Read-Only (1 semana)

- [ ] Setup Next.js standalone com adaptador Cloudflare
- [ ] Auth com Auth.js (email + senha) usando D1 como adapter
- [ ] **Cloudflare D1** com 4 tabelas: `users`, `storage_credentials`, `ai_credentials`, `extension_tokens` (+ sessions do Auth.js)
- [ ] Migrations via `wrangler d1 migrations`
- [ ] Cadastro de credenciais de storage no perfil
- [ ] Cadastro de chaves de IA no perfil
- [ ] Cliente S3/R2/WebDAV (R2 nativo via Cloudflare bindings)
- [ ] Lista read-only de bookmarks (lê `.index.json` do storage do usuário)
- [ ] Visualização read-only do `.md` com embed de YouTube/Vimeo
- [ ] Endpoint `/api/extension/process` (preparado para Fase 6)
- [ ] Página de gerenciamento de tokens da extensão
- [ ] Deploy em **Cloudflare Pages** (free tier)

### Fase 6 — Extensão Chrome (1 semana)

- [ ] Setup do projeto da extensão (Manifest V3)
- [ ] Background script (service worker) para comunicação com portal
- [ ] Content script com Readability.js para extração de conteúdo limpo
- [ ] Popup UI: preview do título, edição de tags, botão Salvar
- [ ] Pareamento com portal: usuário cola token gerado no portal
- [ ] Token armazenado em `chrome.storage.local`
- [ ] Captura inteligente: detecta YouTube, artigos, Twitter, etc
- [ ] Submissão para `POST /api/extension/process` no portal
- [ ] Notificação Chrome ao salvar com sucesso
- [ ] Fila offline: se requisição falhar, salva no `chrome.storage` e tenta depois
- [ ] Atalho de teclado configurável (padrão: `Ctrl+Shift+S`)
- [ ] Publicação na Chrome Web Store

---

## 11. Portal Web Read-Only (Fase 5)

### 11.1 Visão Geral

O portal web é um complemento ao app desktop/Android: permite **acessar e ler** seus bookmarks de qualquer navegador (trabalho, café, casa de amigo, e principalmente para a família) sem precisar instalar nada.

**Multi-usuário desde o dia 1**: cada pessoa (você, esposa, família) tem sua própria conta, com suas credenciais de storage e chaves de IA.

### 11.2 Filosofia: Servidor Magro

O portal nunca armazena bookmarks. Ele é apenas um **intermediário** entre o usuário e seu próprio storage (R2, S3, MinIO, WebDAV). Quando você abre o portal, ele:

1. Autentica você (email + senha)
2. Recupera suas credenciais de storage
3. Lê seus arquivos diretamente do storage configurado
4. Renderiza no browser

Quando você fecha o navegador, **nada permanece** no servidor — sem cache, sem cópias.

### 11.3 Arquitetura

```
┌──────────────────────────┐         ┌──────────────────────────┐
│   App Desktop (Tauri)    │         │   App Android (Tauri)    │
│                          │         │                          │
│  ✏️  CRIA bookmarks      │         │  ✏️  CRIA bookmarks      │
│  🗑️  DELETA bookmarks    │         │  🗑️  DELETA bookmarks    │
└──────────┬───────────────┘         └──────────┬───────────────┘
           │                                    │
           │  escreve .md + .meta.json          │
           ▼                                    ▼
       ┌────────────────────────────────────────────┐
       │   Cloudflare R2 / S3 / MinIO / WebDAV      │
       │       (storage individual de cada user)     │
       └────────────────────┬───────────────────────┘
                            │ lê (read-only)
                            ▼
                  ┌─────────────────────┐
                  │   Portal Web        │
                  │   Next.js + Auth.js │
                  │   + Cloudflare D1   │
                  │                     │
                  │   👁️  APENAS LÊ    │
                  │   🔍  BUSCA         │
                  └─────────────────────┘
```

### 11.4 Modelo de Dados (Cloudflare D1)

```sql
-- Auth.js gerencia automaticamente users, sessions, accounts, verification_tokens

-- Tabelas customizadas:

CREATE TABLE storage_credentials (
  user_id          TEXT PRIMARY KEY REFERENCES users(id),
  storage_type     TEXT NOT NULL,         -- r2 | s3 | minio | webdav
  credentials_json TEXT NOT NULL,         -- JSON com access_key_id, secret, bucket, etc
  updated_at       TIMESTAMP NOT NULL
);

CREATE TABLE ai_credentials (
  user_id          TEXT PRIMARY KEY REFERENCES users(id),
  default_provider TEXT NOT NULL,         -- claude | gemini | openai | openrouter
  keys_json        TEXT NOT NULL,         -- JSON com chaves dos providers
  updated_at       TIMESTAMP NOT NULL
);

CREATE TABLE extension_tokens (
  token        TEXT PRIMARY KEY,          -- 32 bytes random em hex
  user_id      TEXT NOT NULL REFERENCES users(id),
  device_name  TEXT NOT NULL,             -- "Chrome no Notebook do trabalho"
  created_at   TIMESTAMP NOT NULL,
  last_used_at TIMESTAMP,
  revoked_at   TIMESTAMP                  -- NULL = ativo
);
```

> 💡 **Nota sobre storage de credenciais**: o portal armazena chaves de API e credenciais de storage como JSON em texto. **Não é zero-knowledge**, mas as proteções existem: D1 só acessível via binding privado, TLS em trânsito, hash da senha de login com Argon2id, R2 buckets privados. Se você prefere não confiar essas credenciais ao portal, basta não usar a extensão Chrome — o app desktop/Android continua funcionando independente do portal.

### 11.5 Stack do Portal Web

| Tecnologia | Papel |
|---|---|
| Next.js 14 (App Router) | Framework full-stack |
| Auth.js (NextAuth v5) | Autenticação com email/senha + magic link |
| **Cloudflare D1** | Banco de usuários e credenciais |
| Drizzle ORM | Queries type-safe + migrations |
| **Cloudflare R2 (binding nativo)** | Acesso ao storage dos bookmarks |
| `webdav` (npm) | Cliente WebDAV (alternativa) |
| `argon2` (Node) | Hash de senhas |
| Tailwind + shadcn/ui | UI consistente com o app desktop |
| **Cloudflare Pages** | Deploy (free tier suficiente) |

### 11.6 Fluxo de Login e Acesso

```
PRIMEIRA VEZ (cadastro):
1. Usuário cria conta no portal: email + senha
2. Auth.js salva user com password_hash (Argon2id)
3. Após login, vai em "Configurar Storage"
4. Insere credenciais do R2/S3/MinIO/WebDAV
5. Servidor valida credenciais (faz teste de conexão)
6. Salva no D1 (em texto, mas via binding privado)
7. Vai em "Configurar IA" (necessário para extensão Chrome)
8. Insere chaves de API dos providers que usa

LOGIN NORMAL:
1. Usuário entra com email + senha
2. Auth.js valida hash Argon2id
3. Cria sessão (cookie httpOnly + secure)
4. Lista bookmarks lendo .index.json do storage do usuário
5. Quando sessão expira, cookie é invalidado
```

### 11.7 O Que NÃO Está no Escopo do Portal (UI)

A **interface humana** do portal é estritamente read-only:

- ❌ Botão "criar bookmark" na UI (não existe)
- ❌ Botão "editar" (não existe)
- ❌ Botão "deletar" (não existe)
- ❌ Compartilhamento público de bookmarks
- ❌ Cache server-side de conteúdo

**Exceção controlada:** o portal expõe um endpoint `/api/extension/process` que **apenas a extensão Chrome autenticada** pode chamar. É o único caminho de criação via web. Esse endpoint:

- ✅ Exige token de extensão válido (Bearer auth)
- ✅ Recebe URL + HTML opcional (extraído pelo Readability.js)
- ✅ Chama a IA com as chaves do usuário (do D1)
- ✅ Salva direto no storage do usuário (sem cache no servidor)
- ❌ Não é exposto na UI
- ❌ Não tem interface humana — só máquina↔máquina

Se você quiser editar algo, abre o app desktop ou Android. Simples.

---

## 12. Extensão Chrome (Fase 6)

### 12.1 Visão Geral

A extensão Chrome captura a página atual (URL + conteúdo renderizado) e envia para o portal web processar. Resolve o caso de uso "salvar enquanto navego" sem precisar do app desktop rodando ou abrir Android Share Intent.

A extensão **não chama IA diretamente**. Ela é um cliente magro do portal: captura, envia, mostra confirmação. Toda lógica de processamento (IA, salvamento) acontece no portal.

### 12.2 Por Que Não Fala Direto com o App Desktop?

Considerei a opção de a extensão chamar `http://localhost:8765` no app Tauri local. **Decisão: não fazemos isso.** Razões:

- ❌ Exige app rodando — fricção alta no caso de uso comum
- ❌ Não funciona em PC alheio (notebook do trabalho, etc)
- ❌ Configuração extra para porta + permissão de rede
- ❌ Dois caminhos de processamento para manter (app local vs portal)

**Decisão final**: extensão fala **só com o portal web**. Uma única fonte de processamento, igual ao Karakeep.

### 12.3 Fluxo de Pareamento

```
PRIMEIRA VEZ:
1. Usuário instala a extensão da Chrome Web Store
2. Faz login no portal web (linkvault.app)
3. Vai em Configurações → Extensões → "Conectar nova extensão"
4. Portal pede um nome para o dispositivo: "Chrome no notebook"
5. Portal gera token aleatório de 32 bytes (em hex, 64 chars)
6. Token aparece UMA VEZ na tela (estilo "deploy key" do GitHub)
7. Usuário cola o token no popup da extensão
8. Extensão salva token em chrome.storage.local
9. Token também fica registrado no D1 do portal

REQUISIÇÕES:
- Toda chamada da extensão para /api/extension/process
  inclui header: Authorization: Bearer <token>
- Portal valida token contra a tabela extension_tokens
- Atualiza last_used_at em cada uso

REVOGAÇÃO:
- Usuário pode revogar tokens individualmente no portal
- Token revogado tem revoked_at preenchido
- Próxima requisição com esse token retorna 401
```

### 12.4 Captura Inteligente da Página

A extensão usa um **content script** que roda dentro da página, com acesso ao DOM completo após renderização do JavaScript. Isso resolve sites SPA (Medium, Substack, LinkedIn) que normalmente quebram scraping server-side.

```javascript
// content-script.js
import { Readability } from '@mozilla/readability';

function capturePage() {
  const url = window.location.href;
  const title = document.title;
  const type = detectContentType(url);

  let extractedContent = null;
  if (type === 'article') {
    const documentClone = document.cloneNode(true);
    const reader = new Readability(documentClone);
    const article = reader.parse();
    extractedContent = {
      title: article.title,
      text: article.textContent,
      excerpt: article.excerpt,
      siteName: article.siteName,
    };
  }

  return {
    url, title, type,
    extracted_content: extractedContent,
    captured_at: new Date().toISOString(),
  };
}

function detectContentType(url) {
  if (/youtube\.com\/watch|youtu\.be\//.test(url)) return 'youtube';
  if (/vimeo\.com\/\d+/.test(url)) return 'vimeo';
  if (/twitter\.com|x\.com/.test(url)) return 'twitter';
  if (/spotify\.com\/(track|episode|playlist)/.test(url)) return 'spotify';
  return 'article';
}
```

Para tipos como YouTube, **não envia o HTML** — só a URL. O portal usa a API do YouTube para pegar transcrição + metadados, mais eficiente.

### 12.5 Popup da Extensão (UI)

```
┌──────────────────────────────────┐
│  💾 Salvar no LinkVault          │
├──────────────────────────────────┤
│                                  │
│  📄 Rust Ownership Explained     │
│     youtube.com                  │
│                                  │
│  🏷️ Tags sugeridas:              │
│  [rust ✕] [programming ✕]        │
│  [ownership ✕] [+ adicionar]     │
│                                  │
│  ┌────────────────────────────┐  │
│  │  💾  Salvar                │  │
│  └────────────────────────────┘  │
│                                  │
│  ⚙️ Configurações                │
└──────────────────────────────────┘
```

### 12.6 Endpoint `/api/extension/process`

```typescript
// app/api/extension/process/route.ts (no projeto do portal)

export async function POST(req: Request, env: Env) {
  // 1. Autenticação via token
  const token = extractBearerToken(req.headers);
  const tokenRecord = await env.DB
    .prepare('SELECT * FROM extension_tokens WHERE token = ? AND revoked_at IS NULL')
    .bind(token)
    .first();

  if (!tokenRecord) {
    return Response.json({ error: 'Invalid token' }, { status: 401 });
  }

  // 2. Atualiza last_used_at
  await env.DB
    .prepare('UPDATE extension_tokens SET last_used_at = ? WHERE token = ?')
    .bind(Date.now(), token)
    .run();

  // 3. Recebe payload da extensão
  const payload = await req.json();

  // 4. Recupera credenciais do usuário (texto puro do D1)
  const aiCreds = await getAICredentials(env.DB, tokenRecord.user_id);
  const storage = await getStorageBackend(env.DB, env, tokenRecord.user_id);

  // 5. Processa com IA do usuário
  const aiResult = await callAI(aiCreds, payload);

  // 6. Cria .md + .meta.json
  const bookmark = buildBookmark(payload, aiResult);

  // 7. Salva no storage do usuário
  await storage.write(`bookmarks/${bookmark.id}.md`, bookmark.markdown);
  await storage.write(`bookmarks/${bookmark.id}.meta.json`, bookmark.meta);

  // 8. Atualiza .index.json
  await updateIndex(storage, bookmark);

  return Response.json({ success: true, id: bookmark.id });
}
```

### 12.7 Stack da Extensão

| Tecnologia | Papel |
|---|---|
| Manifest V3 | Padrão atual de extensões Chrome |
| TypeScript | Linguagem |
| Vite + `@crxjs/vite-plugin` | Build da extensão |
| `@mozilla/readability` | Extração de artigo limpo |
| React | UI do popup |
| Tailwind CSS | Estilos consistentes com o app |
| `chrome.storage.local` | Persistência do token |
| `chrome.notifications` | Confirmação visual |

---

## 13. Decisões de Design e Justificativas

### Por que arquivos paralelos (`.md` + `.meta.json`) em vez de frontmatter único?

Três motivos: **resiliência** (se um corromper, o outro está intacto), **atualização segura** (mexer em metadados não toca no conteúdo), e **separação de preocupações** (`.md` fica limpo em qualquer editor).

### Por que sem criptografia E2E?

Bookmarks são, por natureza, conteúdo originalmente público que você decidiu lembrar. As proteções existentes (TLS, OS keychain, R2 privado, hash de senha, bindings privados) são equivalentes ao modelo do Karakeep, Pocket, Raindrop. Adicionar cripto E2E custa muito (UX pior, código complexo, perda de senha = perda de dados, busca complicada) sem proteger contra ameaças realistas para o caso de uso.

### Por que não SQLite mesmo nos apps?

A escolha de arquivos é intencional. Benefícios: portabilidade total, backup trivial (zip da pasta), sem risco de corrupção de banco de dados, git-friendly (diffs legíveis), filosofia Unix. O custo (ler N arquivos para listar) é mitigado pelo `.index.json` como cache.

### Por que Tauri e não Electron?

Tauri usa a WebView nativa do SO em vez de embutir Chromium. Resultado: binário ~10MB vs ~150MB do Electron, startup mais rápido, menos uso de RAM, e acesso nativo ao filesystem via comandos Rust seguros. Suporte oficial a Android desde a v2.

### Por que Gemini como provider sugerido?

O Gemini 2.5 Flash tem free tier real e generoso (15 req/min, 1500/dia), suficiente para uso pessoal. Permite que o usuário comece sem gastar nada e migre para Claude/OpenAI se quiser qualidade superior em casos específicos.

### Por que portal web read-only mas extensão pode criar?

Coerência de modelo mental: **criar é ato deliberado** (no app principal ou via captura ativa da extensão); **consultar é casual** (em qualquer navegador, sem complicação). A UI do portal é só leitura — não tem botão pra confundir. A extensão é um caminho separado e explícito de criação.

### Por que multi-usuário no portal?

Permite compartilhar com família. Cada pessoa tem sua conta, seu storage, suas chaves de IA. Sem complexidade de multi-tenancy real porque os dados nunca são misturados (cada um tem seu R2 separado).

### Limitações conhecidas

- Storage local não sincroniza entre dispositivos (por design)
- Áudio precisa de Whisper (API paga ou whisper.cpp local)
- YouTube depende de legendas disponíveis
- Scraping de artigos pode falhar em sites com paywall
- Portal não é zero-knowledge (decisão consciente — adequado para bookmarks)

---

*LinkVault · Arquitetura v3.0 · Gerado com Claude Opus 4.7*
