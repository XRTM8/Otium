const fs = require('fs');
const path = require('path');

const targetVersion = process.argv[2] || '1.5.3';
const numericCode = targetVersion.replace(/\D/g, '');

// 1. package.json
const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = targetVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2. package-lock.json
const lockPath = 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
lock.version = targetVersion;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = targetVersion;
}
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf8');

// 3. tauri.conf.json
const tauriConfPath = 'src-tauri/tauri.conf.json';
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = targetVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');

// 4. Cargo.toml
const cargoTomlPath = 'src-tauri/Cargo.toml';
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${targetVersion}"`);
fs.writeFileSync(cargoTomlPath, cargoToml, 'utf8');

// 5. release-notes.md
const notesPath = 'release-notes.md';
if (fs.existsSync(notesPath)) {
  let notes = fs.readFileSync(notesPath, 'utf8');
  notes = notes.replace(/^#\s*Otium\s*[0-9A-Za-z.-]+/m, `# Otium ${targetVersion}`);
  fs.writeFileSync(notesPath, notes, 'utf8');
}

// 6. tauri.properties
const propsPath = 'src-tauri/gen/android/app/tauri.properties';
if (fs.existsSync(propsPath)) {
  let props = fs.readFileSync(propsPath, 'utf8');
  props = props.replace(/^tauri\.android\.versionName=.+$/m, `tauri.android.versionName=${targetVersion}`);
  props = props.replace(/^tauri\.android\.versionCode=.+$/m, `tauri.android.versionCode=${numericCode || '153'}`);
  fs.writeFileSync(propsPath, props, 'utf8');
}

console.log(`Bumped Otium Reader to ${targetVersion}`);
