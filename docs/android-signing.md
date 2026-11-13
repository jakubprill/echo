# Android signing key

Android installs an update over an existing app only when both APKs are signed with the same key.
Until now every CI run signed the APK with a fresh debug key, so each new version had to be
uninstalled first, which also deleted the user's progress. CI now signs the APK with one stable key
kept in repository secrets.

## One-time setup

1. Create the key on your own computer (needs Java's `keytool`, which comes with any JDK or with Android Studio).
   Use a password made of letters and digits only.

   ```sh
   keytool -genkeypair -v -keystore echo.jks -alias echo -keyalg RSA -keysize 4096 -validity 10000 -storetype PKCS12 -dname "CN=Echo"
   ```

2. Turn the file into text:

   - macOS: `base64 -i echo.jks | pbcopy` (the text is now in the clipboard)
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("echo.jks")) | Set-Clipboard`

3. In GitHub: repository → Settings → Secrets and variables → Actions → New repository secret. Add two secrets:

   | Name | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | the text from step 2 |
   | `ANDROID_KEYSTORE_PASSWORD` | the password from step 1 |

4. Keep `echo.jks` and its password somewhere safe, for example in a password manager. Do not commit
   them (`.gitignore` blocks `*.jks`). If the key is lost, every device has to uninstall Echo once more.

## How the build uses it

- `build.yml` and `release.yml` decode the secret to `src-tauri/gen/android/echo.jks` and write
  `keystore.properties` (store file, password, alias `echo`).
- `scripts/android-shell.mjs` sees `keystore.properties` and adds a signing config to the generated
  `app/build.gradle.kts`, used by both the debug and the release build types.
- Without the secrets, `build.yml` still builds (with a warning and a throwaway debug key);
  `release.yml` stops, because a release must install over the previous one.

## Switching existing devices

The first APK signed with the new key will not install over an APK signed with a debug key. Once per device:

1. In Echo, Settings → Data → "Zapisz kopię" (save a backup).
2. Uninstall Echo, install the new APK.
3. Settings → Data → "Wczytaj kopię" (load the backup). Older backups are converted to profiles.

From then on, new versions install over the old one and keep the progress.
