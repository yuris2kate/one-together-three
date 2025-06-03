import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import fileManager from '../../src/renderer/src/service/gerenciadorArquivo'
import IAServico from '../../src/renderer/src/service/IAService'
import { BackupProcessor, setupBackupIPC } from '../../src/renderer/src/service/backup'
import dotenv from 'dotenv'
import { setDbPath, initialize } from '../renderer/src/service/database'

dotenv.config({ path: join(__dirname, '../../.env') })

// Verifica se o ambiente é executável portátil (como AppImage)
const executableDir = app.getPath('userData')
const dataDir = join(executableDir, 'data')
const txtDir = join(dataDir, 'txt')
const imgDir = join(dataDir, 'img')
const pdfDir = join(dataDir, 'pdf')
const logDir = join(executableDir, 'logs')
const logFilePath = join(logDir, 'app.log')
let keyApiLocalStorage = null

// Cria as pastas se não existirem
const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    logMessage(`Criou a pasta: ${dirPath}`)
  } else {
    logMessage(`A pasta já existia: ${dirPath}`)
  }
}

ensureDir(logDir)
ensureDir(dataDir)
ensureDir(txtDir)
ensureDir(imgDir)
ensureDir(pdfDir)

/* Verifica se o diretório de logs existe e cria se necessário
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
  logMessage('Criou pasta')
} else {
  logError('Pasta ja existe')
}*/

// Função de log para gravar no arquivo
function logMessage(message) {
  const timestamp = new Date().toISOString()
  fs.appendFileSync(logFilePath, `[${timestamp}] ${message}\n`)
}

// Função de log para erros
function logError(error) {
  const timestamp = new Date().toISOString()
  fs.appendFileSync(logFilePath, `[${timestamp}] ERROR: ${error.stack || error}\n`)
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 800, // Define a largura mínima
    minHeight: 600, // Define a altura mínima
    show: false,
    autoHideMenuBar: true,
    icon, // <- Ícone aplicado em todas as plataformas
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.maximize()

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    process.env.DEBUG_MODE ? mainWindow.webContents.openDevTools() : ''
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow
      .loadFile(join(__dirname, '../renderer/index.html'))
      .then(() => logMessage('Janela carregada com sucesso'))
      .catch((error) => logError(`Erro ao carregar a janela: ${error}`))
  }
}

ipcMain.handle('download-image', async (event, imageBuffer) => {
  // Exibe o diálogo de salvar arquivo e aguarda a resposta
  // Opções para o diálogo de salvar
  const options = {
    title: 'Salvar Imagem',
    defaultPath: join(imgDir, 'imagem.png'),
    buttonLabel: 'Salvar',
    filters: [
      { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'gif'] },
      { name: 'Todos os Arquivos', extensions: ['*'] }
    ]
  }

  const result = await dialog.showSaveDialog(options)

  // Verifica se o usuário não cancelou a operação
  if (!result.canceled && result.filePath) {
    const uploadsPath = result.filePath
    // Aqui você pode escrever a imagem no caminho escolhido
    fileManager.downloadImage(imageBuffer, uploadsPath)
  } else {
    logError('Erro no salvamento da imagem.')
    return false
  }

  return true
})

// Comunicação IPC para carregar os links no frontend
ipcMain.on('load-system-info', (event) => {
  let systemInfo = fileManager.loadSystemInfo(txtDir)
  event.returnValue = systemInfo // Envia os links para o renderer
})

// Comunicação IPC para carregar os links no frontend
ipcMain.handle('load-links', async () => {
  try {
    let links = await fileManager.loadLinks()
    return links // Deve ser array/objeto simples!
  } catch (error) {
    console.error('Erro ao carregar links:', error)
    return [] // Ou mensagem de erro simples
  }
})

// Comunicação IPC para carregar os links no frontend
ipcMain.handle('load-videos', async () => {
  try {
    let videos = await fileManager.loadVideos()
    return videos // Deve ser array/objeto simples!
  } catch (error) {
    console.error('Erro ao carregar videos:', error)
    return [] // Ou mensagem de erro simples
  }
})

ipcMain.handle('get-image-dir', () => {
  const imgDir = join(app.getPath('userData'), 'data', 'img')
  return imgDir
})

ipcMain.handle('get-api-key', () => {
  return process.env.YOUTUBE_API_KEY
    ? process.env.YOUTUBE_API_KEY
    : 'AIzaSyDWNbM3kjXiZioItrac91IDdDRx8OPckxQ'
})

ipcMain.handle('get-icon-dir', () => {
  const iconDir = join(app.getPath('userData'), 'data', 'icon')
  return iconDir
})

ipcMain.handle('get-image-base64', async (event, imagePath) => {
  try {
    const raw = fs.readFileSync(imagePath)
    const ext = imagePath.split('.').pop() // png, jpg...
    const base64 = raw.toString('base64')
    return `data:image/${ext};base64,${base64}`
  } catch (err) {
    console.error('Erro ao ler imagem:', err)
    return null
  }
})

ipcMain.handle('get-icon-base64', async (event, imagePath) => {
  try {
    const raw = fs.readFileSync(imagePath)
    const ext = imagePath.split('.').pop() // png, jpg...
    const base64 = raw.toString('base64')
    return `data:image/${ext};base64,${base64}`
  } catch (err) {
    console.error('Erro ao ler imagem:', err)
    return null
  }
})

ipcMain.on('load-articles', (event) => {
  let articles = fileManager.loadArticles(txtDir)
  event.returnValue = articles
})

// Comunicação IPC para carregar os links no frontend
ipcMain.on('load-fonts', (event) => {
  let fonts = fileManager.loadFonts(txtDir)
  event.returnValue = fonts
})

// Comunicação IPC para carregar os links no frontend
ipcMain.on('load-frameworks', (event) => {
  let frameworks = fileManager.loadFrameworks(txtDir)
  event.returnValue = frameworks
})

ipcMain.on('load-apis', (event) => {
  let apis = fileManager.loadApis(txtDir)
  event.returnValue = apis
})

ipcMain.on('load-algorithms', (event) => {
  let algorithms = fileManager.loadAlgorithms(txtDir)
  event.returnValue = algorithms
})

ipcMain.on('load-images', (event) => {
  let images = fileManager.loadImages(txtDir)
  event.returnValue = images
})

ipcMain.on('load-icons', (event) => {
  let icons = fileManager.loadIcons(txtDir)
  event.returnValue = icons
})

ipcMain.on('load-palettes', (event) => {
  let palettes = fileManager.loadPalettes(txtDir)
  event.returnValue = palettes
})
// Comunicação IPC para salvar os links no arquivo
ipcMain.handle('save-system-info', async (event, systemInfo) => {
  fileManager.saveSystemInfo(txtDir, systemInfo)
  return true
})

ipcMain.handle('save-links', async (event, links) => {
  fileManager.saveLinks(links)
  return true
})

ipcMain.handle('save-articles', async (event, articles) => {
  fileManager.saveArticles(articles)
  return true
})

ipcMain.handle('save-fonts', async (event, fonts) => {
  fileManager.saveFonts(txtDir, fonts)
  return true
})

ipcMain.handle('save-videos', async (event, videos) => {
  fileManager.saveVideos(videos)
  return true
})

ipcMain.handle('save-frameworks', async (event, frameworks) => {
  fileManager.saveFrameworks(txtDir, frameworks)
  return true
})

ipcMain.handle('save-algorithms', async (event, algorithms) => {
  fileManager.saveAlgorithms(txtDir, algorithms)
  return true
})

ipcMain.handle('save-apis', async (event, apis) => {
  fileManager.saveApis(txtDir, apis)
  return true
})

ipcMain.handle('set-key-local', async (event, apiKey) => {
  process.env.OPENROUTER_API_LOCAL_KEY = apiKey
  return true
})

ipcMain.on('save-key-local', async () => {
  return keyApiLocalStorage
})

ipcMain.handle('save-images', async (event, images) => {
  fileManager.saveImages(txtDir, images)
  return true
})

ipcMain.handle('save-icons', async (event, icons) => {
  fileManager.saveIcons(txtDir, icons)
  return true
})

ipcMain.handle('save-palettes', async (event, palettes) => {
  fileManager.savePalettes(txtDir, palettes)
  return true
})

// Manipulador IPC para upload de imagem
ipcMain.handle('upload-image', async (event, imageBuffer, fileName) => {
  const filePath = join(imgDir, fileName)
  fs.writeFileSync(filePath, Buffer.from(imageBuffer))
  return filePath
})

// Manipulador IPC para upload de icon
ipcMain.handle('upload-icon', async (event, imageBuffer, fileName) => {
  const filePath = join(imgDir, fileName)
  fs.writeFileSync(filePath, Buffer.from(imageBuffer))
  return filePath
})

ipcMain.handle('upload-image-font', async (event, imageBuffer, fileName) => {
  const filePath = join(imgDir + '/fontStorage', fileName)
  fs.writeFileSync(filePath, Buffer.from(imageBuffer))
  return filePath
})

ipcMain.handle('upload-pdf', async (event, pdfBuffer, fileName) => {
  const filePath = join(pdfDir, fileName)
  fs.writeFileSync(filePath, Buffer.from(pdfBuffer))
  return filePath
})

ipcMain.handle('delete-link', async (event, linkId) => {
  fileManager.deleteLink(linkId)
  return true
})

ipcMain.handle('delete-video', async (event, videoId) => {
  fileManager.deleteVideo(videoId)
  return true
})

ipcMain.handle('select-backup-directory', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  } catch (err) {
    console.error('Erro ao escolher diretório:', err)
    return null
  }
})

// Criar instância do BackupProcessor
const backupProcessor = new BackupProcessor(fileManager, txtDir)

// Configurar IPC handlers
setupBackupIPC(backupProcessor)

// Handler para obter o caminho padrão de backup
ipcMain.handle('get-default-backup-path', async () => {
  const userDataPath = app.getPath('userData')
  const backupDir = join(userDataPath, 'backups')

  // Garante que o diretório existe
  await fs.promises.mkdir(backupDir, { recursive: true })

  // Cria nome do arquivo com timestamp
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '')
  const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '')
  return join(backupDir, `backup_${dateStr}_${timeStr}.bin`)
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  setDbPath(dataDir)
  await initialize()

  // Depois de criar a janela, instancie o serviço:
  const iaServico = new IAServico()
  iaServico.registerHandlers()

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => logMessage('Pong'))

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    logMessage('Janela carregada com sucesso')
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  logMessage('Janela fechada com sucesso')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
