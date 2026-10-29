// Rasterizes assets/logo.svg into assets/icon.png, tray-icon.png and icon.ico.
// Run with Electron (no image dependency needed): npx electron scripts/generate-icons.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'wt-icons-')));

function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  const entries = [];
  const datas = [];
  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
    datas.push(data);
  }
  return Buffer.concat([header, ...entries, ...datas]);
}


const assetsDir = path.join(__dirname, '..', 'assets');
const svgB64 = fs.readFileSync(path.join(assetsDir, 'logo.svg')).toString('base64');

async function render(size) {
  const win = new BrowserWindow({
    width: size, height: size, show: false, frame: false, transparent: true,
    useContentSize: true, webPreferences: { offscreen: false },
  });
  const html = `<body style="margin:0;background:transparent"><img width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${svgB64}"></body>`;
  const htmlPath = path.join(app.getPath('userData'), `logo-${size}.html`);
  fs.writeFileSync(htmlPath, html);
  await win.loadFile(htmlPath);
  await new Promise((r) => setTimeout(r, 200));
  let img = await win.webContents.capturePage();
  const got = img.getSize();
  if (got.width !== size) img = img.resize({ width: size, height: size, quality: 'best' });
  win.destroy();
  return img.toPNG();
}

app.on('window-all-closed', () => {}); // keep alive between renders

app.whenReady().then(async () => {
  const sizes = [16, 32, 48, 256];
  const pngBuffers = [];
  for (const size of sizes) pngBuffers.push({ size, data: await render(size) });
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), pngBuffers.find((p) => p.size === 256).data);
  fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), pngBuffers.find((p) => p.size === 32).data);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), buildIco(pngBuffers));
  console.log('Generated assets/icon.png, assets/tray-icon.png, assets/icon.ico');
  app.quit();
});
