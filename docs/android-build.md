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
npm run tauri -- android init
```

Isso cria `src-tauri/gen/android/` com o projeto Gradle e o `AndroidManifest.xml`.

> O diretório `src-tauri/gen/android/` é **commitado** (vai pro git) — assim outras pessoas que clonarem o repo não precisam rodar `init`. Apenas o `gen/schemas` é regenerado a cada build (já está no `.gitignore`).

## 3. Adicionar o intent-filter de Share (manual)

Edita `src-tauri/gen/android/app/src/main/AndroidManifest.xml` e adiciona dentro da `<activity>` principal:

```xml
<!-- Receber links compartilhados -->
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="text/plain" />
</intent-filter>

<!-- Receber arquivos de áudio (Phase 3 final) -->
<intent-filter>
  <action android:name="android.intent.action.SEND" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="audio/*" />
</intent-filter>
```

## 4. Rodar em dev (com device conectado via USB ou emulador rodando)

```bash
adb devices    # confirma que o device aparece
npm run tauri -- android dev
```

Tauri vai compilar o Rust pra arquitetura do device, instalar o APK debug, e abrir o app com hot-reload do frontend.

## 5. Build de release

```bash
npm run tauri -- android build
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

## Permissions Android adicionais

Depois do `tauri android init`, edita `src-tauri/capabilities/default.json` e adiciona:

```json
"barcode-scanner:allow-scan",
"barcode-scanner:allow-cancel"
```

E em `src-tauri/gen/android/app/src/main/AndroidManifest.xml`, dentro de `<manifest>` (não dentro de `<application>`):

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
```
