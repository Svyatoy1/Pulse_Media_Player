# Pulse Media Player

Desktop multimedia player created for Laboratory Work №2 in the course **Development of Multimedia Systems**.

## Implemented functionality

- Opening one or several local media files through a native file dialog
- Play, Pause and Stop
- Seeking backward and forward by 10 seconds
- Previous and next playlist item
- Interactive progress bar
- Current and total playback time
- Volume control and Mute
- MP3 and WAV audio playback
- MP4 and WebM video playback
- Direct HTTP/HTTPS media URL playback
- Playlist with item removal
- Drag-and-drop support
- Playback speed from 0.5× to 2×
- Fullscreen mode
- Keyboard shortcuts
- Real-time audio frequency visualization through the Web Audio API

## Technologies

- JavaScript
- Electron
- Vite
- HTML5 Audio/Video API
- Web Audio API and Canvas
- HTML and CSS

## Requirements

- Node.js 20 or newer
- npm

## Running the application

Open the project folder in Visual Studio Code and run the following commands in
its integrated terminal. The same commands can also be used in any terminal
opened in the project folder.

On the first launch, install the dependencies:

```bash
npm install
```

Then launch the application:

```bash
npm run dev
```

For subsequent launches, only `npm run dev` is required.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / Pause |
| Left arrow | Back 10 seconds |
| Right arrow | Forward 10 seconds |
| Up arrow | Increase volume |
| Down arrow | Decrease volume |

## Supported formats

The required formats are MP3, WAV, MP4 and WebM. Actual codec playback also depends on the codecs supported by the operating system and the Electron/Chromium build.

For URL playback, use a direct link to a media file rather than a link to a web page.
