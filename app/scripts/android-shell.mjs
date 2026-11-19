// Run after `tauri android init`: puts Echo's own MainActivity (system bar insets, self-update and
// speech recognition bridge) into the generated Android project, lets it install updates and record
// spoken answers and, when src-tauri/gen/android/keystore.properties exists, signs every build type
// with that stable key. Usage: node scripts/android-shell.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const conf = JSON.parse(fs.readFileSync(path.join(app, "src-tauri/tauri.conf.json"), "utf8"));
const pkg = conf.identifier.replaceAll("-", "_");
const target = path.join(app, "src-tauri/gen/android/app/src/main/java", ...pkg.split("."), "MainActivity.kt");
if (!fs.existsSync(target)) {
  console.error(`No generated MainActivity at ${target}. Run "npx tauri android init" first.`);
  process.exit(1);
}
const source = fs.readFileSync(path.join(app, "src-tauri/android/MainActivity.kt"), "utf8");
fs.writeFileSync(target, source.replace("{{package}}", pkg));
console.log(`Replaced ${path.relative(app, target)}`);

// Manifest entries Echo's activity needs:
// - self-update (MainActivity.installUpdate) opens the system installer;
// - the voice mode records the spoken answer and, from Android 11, has to declare that it looks
//   for the system speech recognition service, or SpeechRecognizer reports it as missing.
const manifest = path.join(app, "src-tauri/gen/android/app/src/main/AndroidManifest.xml");
const entries = [
  ["REQUEST_INSTALL_PACKAGES", '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'],
  ["RECORD_AUDIO", '<uses-permission android:name="android.permission.RECORD_AUDIO" />'],
  ["android.speech.RecognitionService", '<queries><intent><action android:name="android.speech.RecognitionService" /></intent></queries>'],
];
let m = fs.readFileSync(manifest, "utf8");
if (!/^[ \t]*<application\b/m.test(m)) {
  console.error(`No <application> element in ${path.relative(app, manifest)}; the generated file has changed.`);
  process.exit(1);
}
for (const [key, entry] of entries)
  if (!m.includes(key)) m = m.replace(/^([ \t]*)<application\b/m, (all, indent) => `${indent}${entry}\n${all}`);
fs.writeFileSync(manifest, m);
console.log(`Allowed installing updates, the microphone and speech recognition in ${path.relative(app, manifest)}`);

// Stable signing key. Android only installs an update over an existing app when both are signed
// with the same key; the default debug key is new on every CI machine, which forced an uninstall
// (and lost progress) on each update. CI writes keystore.properties from repository secrets.
const android = path.join(app, "src-tauri/gen/android");
const props = path.join(android, "keystore.properties");
const gradle = path.join(android, "app/build.gradle.kts");
if (fs.existsSync(props)) {
  let g = fs.readFileSync(gradle, "utf8");
  if (!g.includes('create("echo")')) {
    const signing = `    signingConfigs {
        create("echo") {
            val keystore = Properties().apply { rootProject.file("keystore.properties").inputStream().use { load(it) } }
            storeFile = rootProject.file(keystore.getProperty("storeFile"))
            storePassword = keystore.getProperty("password")
            keyAlias = keystore.getProperty("keyAlias")
            keyPassword = keystore.getProperty("password")
        }
    }
`;
    const patched = g
      .replace(/^    buildTypes \{\n/m, (m) => signing + m)
      .replace(/getByName\("(debug|release)"\) \{\n/g, (m) => `${m}            signingConfig = signingConfigs.getByName("echo")\n`);
    if (patched === g || !patched.includes("signingConfigs {") || (patched.match(/signingConfigs\.getByName/g) ?? []).length !== 2) {
      console.error(`Could not add the signing config to ${path.relative(app, gradle)}; the generated file has changed.`);
      process.exit(1);
    }
    if (!patched.includes("import java.util.Properties")) g = "import java.util.Properties\n" + patched;
    else g = patched;
    fs.writeFileSync(gradle, g);
  }
  console.log(`Signing with the stable key from ${path.relative(app, props)}`);
} else {
  console.log("No keystore.properties: the APK is signed with the debug key of this machine.");
}
