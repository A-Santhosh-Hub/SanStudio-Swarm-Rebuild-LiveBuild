# SanStudio LiveBuild

**Turn any HTML website into a live build show.** Drop your HTML file into a small desktop app, and get back a new file with an animated intro inside it. A swarm of cursors builds your page in front of your visitors, then fades into the real website.

Visitors don't need to install anything, so the intro also plays on phones.

> **Fan-made project.** LiveBuild is inspired by the concept of the [Swarm Rebuild](https://chromewebstore.google.com/detail/diaeaocnhdhbknkbfbnkjikfcgokainm) browser extension. It is an independent project, written to work without an extension. It is not affiliated with or endorsed by the makers of Swarm Rebuild, and it does not include the extension's files.

## What visitors see

1. The page opens on a blank canvas, and cursors fly in.
2. The cursors rebuild the page piece by piece:
   - boxes dragged out with resize handles and size badges
   - text typed letter by letter
   - rulers and guides that text snaps to
   - repeated cards copied with an alt-drag
3. Scrolling down builds more. **Tour** scrolls by itself.
4. When the page is finished, **Go live** fades the canvas into the real website.

Visitors can press **Skip** or the Esc key at any time to go straight to the website. The M key or the speaker button turns sound on and off. Sound starts off.

## Requirements

- Windows
- [Python 3](https://www.python.org/downloads/) with tkinter, which the standard installer includes

There are no packages to install.

## How to use it

1. On this GitHub page, press **Code > Download ZIP**, then extract the ZIP.
2. Double-click `START.bat`.
3. Drag your website's HTML file or whole website folder into the window, or click the window to choose a file. It is analyzed and exported automatically.
4. Press **Open preview** and check the result.
5. Upload the exported file to your website.

The exported file is saved next to your original as `yourfile.livebuild.html`. To use it as your home page, rename it to `index.html`.

- Your original file is never changed.
- Keep the exported file in the same folder as your images and CSS, so its links still work.
- For React or Vue projects, run your build first and drop the built `index.html`.

### Websites with separate files

A website split into separate files works the same way:

```text
my-portfolio/
├── index.html
├── style.css
├── script.js
└── assets/
```

1. Drag the whole `my-portfolio` folder into the window. You can also drag just `index.html`. Unzip the folder first if it's a ZIP.
2. A new `index.livebuild.html` appears in that folder. Don't move it. Your other files stay the same.
3. Press **Open preview** and check the result.
4. Rename `index.html` to `index-old.html`, then rename `index.livebuild.html` to `index.html`.
5. Upload your website as usual, keeping `index.html` next to its CSS, JavaScript and `assets` folder. If those files are already online, you only need to upload the new `index.html`.

To undo this, rename `index-old.html` back to `index.html`.

A dropped folder only adds the intro to its `index.html`. To add it to another page, such as `about.html`, drop that file separately.

### App buttons

| Button | What it does |
|---|---|
| Open preview | Opens the exported file in your browser |
| Show in folder | Shows the exported file in File Explorer |
| Copy HTML | Copies the exported code so you can paste it |
| Save as… | Saves a copy somewhere else |

Tick **Play only once per browser tab** before you drop a file if the intro shouldn't replay when a visitor reloads the page.

## Project files

| File | What it does |
|---|---|
| `START.bat` | Starts the app. Double-click this one. |
| `app.py` | The app window and drag and drop |
| `injector.py` | Analyzes your HTML and adds the intro |
| `live_build.js` | The intro that plays in the browser |
| `.gitignore` | Keeps temporary files out of the repository |

Keep `START.bat`, `app.py`, `injector.py` and `live_build.js` together in one folder. The app needs all of them.

## When the intro doesn't play

Visitors go straight to the real website when:

- the address ends in `?nointro`
- the link points to a section, such as `page.html#contact`
- their device has reduced motion turned on
- the page is shown inside an iframe

If the intro fails, the real website is shown instead, so visitors don't get stuck on a blank screen.

## Good to know

Always check the preview, because no tool can match every website perfectly.

- Maps and YouTube embeds appear as labelled boxes during the build.
- 3D models and canvas animations appear as still images during the build.
- Pages using GSAP or a custom scroll library may look different during the build. The app warns you when it finds one.
- A page with a strict Content Security Policy blocks the intro. The website still works, and the app warns you.
- The app runs on Windows only. The exported website works in the browser on any device.

## Privacy

Everything runs on your own computer. The app doesn't upload your files, and the intro doesn't collect data or send anything to a server.

The intro's toolbar shows a "Developed by SanStudio" link. It only opens that page if a visitor clicks it.

## Remove the intro

Delete the two blocks marked `SANSTUDIO LIVEBUILD` from the exported file, or upload your original file again. Dropping an exported file into the app again replaces its intro instead of adding a second one.

## Developer

**Developed by SanStudio** (Santhosh A)

- Website: [a-santhosh-hub.github.io/in](https://a-santhosh-hub.github.io/in/)
- Portfolio: [santhosh2024.neocities.org](https://santhosh2024.neocities.org/)
- GitHub: [A-Santhosh-Hub](https://github.com/A-Santhosh-Hub)
- LinkedIn: [santhosh-a-sanstudio](https://www.linkedin.com/in/santhosh-a-sanstudio/)
