const { app, BrowserWindow, dialog, ipcMain, protocol } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "local-media",
    privileges: {
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true
    }
  }
]);

const selectedMedia = new Map();
const supportedExtensions = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".mp4",
  ".webm",
  ".ogv",
  ".mov"
]);

const mediaTypes = new Map([
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".ogv", "video/ogg"],
  [".mov", "video/quicktime"]
]);

function parseByteRange(rangeHeader, fileSize) {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2]) || fileSize === 0) return false;

  let start;
  let end;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return false;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= fileSize ||
    end < start
  ) {
    return false;
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

async function serveLocalMedia(request, filePath) {
  let fileSize;

  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) throw new Error("Not a file");
    fileSize = stats.size;
  } catch {
    return new Response("Media file is unavailable", { status: 404 });
  }

  const range = parseByteRange(request.headers.get("range"), fileSize);
  if (range === false) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${fileSize}`
      }
    });
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? Math.max(fileSize - 1, 0);
  const contentLength = fileSize === 0 ? 0 : end - start + 1;
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Length": String(contentLength),
    "Content-Type": mediaTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream"
  };

  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${fileSize}`;
  }

  const body = request.method === "HEAD" || fileSize === 0
    ? null
    : Readable.toWeb(fs.createReadStream(filePath, { start, end }));

  return new Response(body, {
    status: range ? 206 : 200,
    headers
  });
}

function mediaKind(filePath) {
  return [".mp3", ".wav", ".ogg", ".m4a", ".aac"].includes(
    path.extname(filePath).toLowerCase()
  )
    ? "audio"
    : "video";
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#090b10",
    title: "Pulse Media Player",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.setMenuBarVisibility(false);

  window.loadURL(process.env.VITE_DEV_SERVER_URL);
}

app.whenReady().then(() => {
  protocol.handle("local-media", (request) => {
    const requestUrl = new URL(request.url);
    const id = requestUrl.pathname.replace(/^\//, "");
    const filePath = selectedMedia.get(id);

    if (!filePath) {
      return new Response("Media file is unavailable", { status: 404 });
    }

    return serveLocalMedia(request, filePath);
  });

  ipcMain.handle("dialog:open-media", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open media files",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Supported media",
          extensions: ["mp3", "wav", "ogg", "m4a", "aac", "mp4", "webm", "ogv", "mov"]
        },
        { name: "All files", extensions: ["*"] }
      ]
    });

    if (result.canceled) return [];

    return result.filePaths
      .filter((filePath) => supportedExtensions.has(path.extname(filePath).toLowerCase()))
      .map((filePath) => {
        const id = crypto.randomUUID();
        selectedMedia.set(id, filePath);

        return {
          id,
          name: path.basename(filePath),
          url: `local-media://media/${id}`,
          kind: mediaKind(filePath),
          source: "local"
        };
      });
  });

  ipcMain.handle("app:get-version", () => app.getVersion());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
