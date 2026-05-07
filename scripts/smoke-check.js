const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function fail(message) {
  throw new Error(message);
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(root, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(fullPath, files);
      continue;
    }
    files.push({ fullPath, rel, name: entry.name });
  }
  return files;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function checkJsSyntax() {
  const jsFiles = walk(path.join(root, 'api'))
    .concat(walk(path.join(root, 'app')))
    .filter((file) => file.name.endsWith('.js'))
    .filter((file) => !file.name.includes('.bak') && !file.name.includes('backup'));

  for (const file of jsFiles) {
    const source = fs.readFileSync(file.fullPath, 'utf8');
    try {
      new Function(source);
    } catch (err) {
      fail(`JS syntax failed: ${file.rel}: ${err.message}`);
    }
  }

  return jsFiles.length;
}

function checkFrontendFiles() {
  for (const rel of ['app/index.html', 'app/app.js', 'app/config.js', 'app/styles.css']) {
    const stat = fs.statSync(path.join(root, rel));
    if (!stat.isFile() || stat.size <= 0) fail(`missing or empty frontend file: ${rel}`);
  }

  const html = read('app/index.html');
  if (!/<link\s+rel="stylesheet"\s+href="styles\.css(?:\?[^"]*)?">/.test(html)) {
    fail('index.html must load styles.css');
  }
  if (!/<script\s+src="config\.js"><\/script>/.test(html)) fail('index.html must load config.js');
  if (!/<script\s+src="app\.js(?:\?[^"]*)?"><\/script>/.test(html)) fail('index.html must load app.js');
}

function checkDriftSignals() {
  const trackedLikeFiles = walk(root)
    .filter((file) => !file.rel.startsWith('data/'))
    .filter((file) => !file.rel.startsWith('node_modules/'))
    .filter((file) => !file.rel.startsWith('api/node_modules/'))
    .filter((file) => !file.rel.startsWith('.git/'));

  const badBackup = trackedLikeFiles.find((file) =>
    /\.(bak|backup)$/i.test(file.name) || file.name.includes('.bak_')
  );
  if (badBackup) fail(`backup artifact still present: ${badBackup.rel}`);

  const textFiles = trackedLikeFiles
    .filter((file) => /\.(js|html|css|md|json|yml|yaml)$/i.test(file.name));

  for (const file of textFiles) {
    const source = fs.readFileSync(file.fullPath, 'utf8');
    if (/192\.168\.\d+\.\d+/.test(source)) fail(`hard-coded LAN IP found: ${file.rel}`);
    if (/D:\\rd-lounin-guide/i.test(source)) fail(`old D: workspace path found: ${file.rel}`);
  }

  const photosRoute = read('api/routes/photos.js');
  if (/UPDATE\s+photos[\s\S]{0,200}updated_at/i.test(photosRoute)) {
    fail('photos route must not update updated_at; NAS photos schema does not have it');
  }

  const documentsRoute = read('api/routes/documents.js');
  if (!documentsRoute.includes("'/data/uploads' + row.file_path")) {
    fail('documents delete must remove files from /data/uploads + file_path');
  }
}

const jsCount = checkJsSyntax();
checkFrontendFiles();
checkDriftSignals();

console.log(`smoke-check ok: ${jsCount} active JS files`);
