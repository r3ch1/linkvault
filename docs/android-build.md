# Build Android — passos manuais

> 🇬🇧 [English version](android-build.en.md)

A inicialização do projeto Android (criar a estrutura `gen/android/`, AndroidManifest, etc) requer Android SDK + NDK instalados e **precisa ser feita uma vez por máquina**. Não dá pra automatizar isso pelo CI sem ter os SDKs cacheados.

## 1. Pré-requisitos

- **Android Studio** instalado (vem com SDK Manager) — ou só o SDK Command-Line Tools
- **JDK 17+** (Android Studio embarca um, ou `apt install openjdk-17-jdk`)
- **Android SDK** com:
  - Android SDK Platform 34+
  - Android NDK (Side by side) — qualquer versão >= 25
  - Android SDK Build-Tools 34+
- Variáveis de ambiente (no teu `.bashrc` ou `.zshrc`):
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export NDK_HOME=$ANDROID_HOME/ndk/<versão>   # ex: 26.1.10909125
  export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
  ```
- **Targets Rust** para Android:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```

Documentação oficial atualizada: https://v2.tauri.app/start/prerequisites/#android

## 2. Inicializar o projeto Android

Da raiz do repo:

```bash
npm run android:init
```

Isso roda `tauri android init` (cria `src-tauri/gen/android/` com o projeto Gradle e o `AndroidManifest.xml`) e **logo em seguida** aplica nosso patch automatizado em cima do manifest (camera permission + intent-filters de Share).

> O diretório `src-tauri/gen/android/` **NÃO é commitado** — é código gerado e está no `.gitignore`. Quem clonar o repo precisa rodar `npm run android:init` uma vez por máquina (mesmo passo é necessário pra ter SDK/NDK instalados de qualquer jeito).

Os scripts disponíveis são:

| Comando | O que faz |
|---|---|
| `npm run android:init` | `tauri android init` + aplica patch do manifest |
| `npm run android:patch` | Só reaplica o patch (idempotente — pode rodar a qualquer momento) |
| `npm run android:dev` | Aplica patch + `tauri android dev` |
| `npm run android:build` | Aplica patch + `tauri android build` |

O patch fica em [`scripts/android-patch.mjs`](../scripts/android-patch.mjs) — é versionado, então edits que você queira fazer no manifest viram código no script e propagam pra todas as máquinas via git.

## 3. O que o patch automatizado faz

Se você quiser saber **o que** `npm run android:patch` adiciona no manifest (pra revisar antes de rodar, ou pra editar o script), aqui estão os blocos exatos. Não precisa fazer nada manual — o `npm run android:init` aplica tudo.

### 3.1 Permissions de câmera

Logo abaixo de `<uses-permission android:name="android.permission.INTERNET" />`, adiciona:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```

### 3.2 Intent-filters de Share

Dentro do `<activity android:name=".MainActivity">`, **logo depois** do intent-filter de `LAUNCHER`, adiciona:

```xml
<!-- Receber links compartilhados de outros apps (Phase 3) -->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>

<!-- Receber arquivos de áudio compartilhados (Phase 3 final) -->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="audio/*" />
</intent-filter>
```

### 3.3 Versão completa do manifesto (referência)

Como `<application>` deve ficar depois do patch:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />

    <!-- AndroidTV support -->
    <uses-feature android:name="android.software.leanback" android:required="false" />

    <application
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.linkvault"
        android:usesCleartextTraffic="${usesCleartextTraffic}">
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:launchMode="singleTask"
            android:label="@string/main_activity_title"
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>

            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>

            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="audio/*" />
            </intent-filter>
        </activity>

        <provider
          android:name="androidx.core.content.FileProvider"
          android:authorities="${applicationId}.fileprovider"
          android:exported="false"
          android:grantUriPermissions="true">
          <meta-data
            android:name="android.support.FILE_PROVIDER_PATHS"
            android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
```

## 4. Rodar em dev (com device conectado via USB ou emulador rodando)

```bash
adb devices    # confirma que o device aparece
npm run android:dev
```

Tauri vai compilar o Rust pra arquitetura do device, instalar o APK debug, e abrir o app com hot-reload do frontend.

## 5. Build de release

```bash
npm run android:build
```

Output APK assinado fica em `src-tauri/gen/android/app/build/outputs/apk/`.

> Pra publicar na Play Store você precisa criar um keystore próprio e configurar signing. Detalhes: https://v2.tauri.app/distribute/sign/android/

## 6. Pareamento

Depois que o app estiver rodando no Android:

1. **No desktop**: Configurações → "Conectar Android (gerar QR)" → mostra o QR (TTL 60s).
2. **No Android**: Configurações → "Importar do desktop" → "Escanear QR Code" → câmera abre, aponta para o desktop.
3. Após confirmação, o storage e as chaves de IA são copiados pro Android Keystore. Os bookmarks aparecem automaticamente porque ambos os devices passam a ler o mesmo bucket/pasta.

Se a câmera falhar, dá pra usar o **fallback de copy/paste**: clica em "Copiar" no desktop, manda o JSON pro Android (Telegram saved messages, e-mail pra si mesmo, etc), no Android escolhe "Colar payload JSON" e cola.

## Problemas comuns

**"NDK_HOME not set"**:
- Confere que `NDK_HOME` aponta pra versão certa. `ls $ANDROID_HOME/ndk/` lista as instaladas.

**"linker `aarch64-linux-android-clang` not found"**:
- Falta target Rust pra Android. Roda o `rustup target add` da seção 1.

**Build muito lento na primeira vez**:
- Normal — Cargo precisa compilar centenas de crates pro target Android. Próximas builds usam cache.

**App abre mas câmera não funciona**:
- Confere que o `tauri-plugin-barcode-scanner` foi adicionado nas permissions do `src-tauri/capabilities/default.json` antes do build. Veja a próxima seção.

## Permissions Tauri (já no repo)

As permissions necessárias do `barcode-scanner` já estão em `src-tauri/capabilities/mobile.json` (versionado), então não precisa adicionar nada — o Tauri pega automaticamente em build de Android/iOS.

O `mobile.json` tem um `"platforms": ["android", "iOS"]` que evita que essas permissions sejam aplicadas em build desktop (quebraria o desktop).
