const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

// Set resource paths for the engine binary and assets (these live outside asar)
if (app.isPackaged) {
  process.env.ENGINE_PATH = path.join(process.resourcesPath, 'pikafish');
  process.env.NNUE_PATH = path.join(process.resourcesPath, 'pikafish.nnue');
  process.env.PUBLIC_PATH = path.join(process.resourcesPath, 'public');
}

// Require server.js from the same directory (both live inside asar)
const { startServer, stopEngine } = require('./server.js');

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1150,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: '象棋 — Chinese Chess',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: '#1a1520',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    const port = await startServer(0); // port 0 = OS picks a free port
    await createWindow(port);
  } catch (err) {
    console.error('Startup failed:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopEngine();
  app.quit();
});

app.on('before-quit', () => {
  stopEngine();
});
