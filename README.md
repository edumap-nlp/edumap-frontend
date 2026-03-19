# edumap-frontend

Web UI for **EduMap**: transform academic PDFs into interactive, structured mind maps. Built with React, Vite, and TypeScript.

## Features

- **Markdown editor** (left panel): Edit hierarchical content; input is Markdown (extraction from PDF is handled elsewhere).
- **Mind map viewer** (right panel): Renders the same content as an interactive mind map; updates as you edit.
- **Export**: Export the mind map as SVG or Markdown from the viewer panel.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Scripts

- `npm run dev` – start dev server
- `npm run build` – production build
- `npm run preview` – preview production build