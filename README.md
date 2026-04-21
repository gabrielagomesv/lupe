# Lupe

A visual new tab page to save, organize and browse your links — by collection, in a grid or list view. No accounts, stored locally.

![Lupe](assets/lupe.svg)

## Features

- **Save anything** — websites, videos, images and books. Lupe automatically fetches a preview image, title and metadata.
- **Two layouts** — switch between a visual masonry grid and a clean list view.
- **Collections** — group your links into named collections. Rename, reorder and delete them inline.
- **Search** — instantly filter saved links by title or URL.
- **Drawer** — save directly from any open tab without leaving the new tab page.
- **Local first** — everything is stored in your browser. No accounts, no tracking, no servers.

## Installation

### From the Chrome Web Store
Coming soon.

### Manual (Developer Mode)
1. Clone or download this repo
2. Go to `chrome://extensions`
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked** and select the `lupe` folder

## Tech

- Vanilla JavaScript (no frameworks)
- Chrome Extensions Manifest V3
- [Microlink API](https://microlink.io) for metadata and screenshots
- Google Books API for book covers
- YouTube oEmbed for video thumbnails

## License

MIT
