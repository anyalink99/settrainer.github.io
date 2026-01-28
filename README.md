# Set Pro Training

### 🔗 Play Now: [https://anyalink99.github.io/settrainer.github.io/](https://anyalink99.github.io/settrainer.github.io/)

---

**Set Pro Training** is a high-performance web-based trainer for the classic card game **Set**. Built for speed, analytics, and serious practice, it gives you a customizable board, detailed stats, game modes, and full control over appearance and controls - all in the browser, or locally.

---

## 🚀 Key Features

### Appearance & Board

* **Shape presets:** **Standard** (geometric) or **Classic** (Ovals, Diamonds, Waves).
* **Orientation:** Vertical or horizontal board layout.
* **Custom colors:** Per-card-color picker with hex input for all three Set colors.
* **Animation speed:** Slider from 0.1× to 2.0× for faster or slower feedback.
* **Resizable layout:** Drag left/right edges to change app width; setting is saved locally.

### Analytics & HUD

* **Possible Sets:** Live count of valid sets on the board.
* **Set breakdown:** Counts by how many attributes differ (4 Diff, 1–3 Same).
* **Live Sets Per Minute (SPM):** Optional real-time pace indicator with color coding.
* **Timer:** Optional elapsed-time display.
* **Synchronized Seed indicator:** Shown when Fixed Seed mode is on.

### Performance & Results

* **Session stats:** Total time, average find time, fastest and slowest set.
* **Bad Shuffle count:** Tracks “shuffle while a set was still on the board” (training feedback).
* **Speed chart:** Sets-per-minute over time (Chart.js).
* **Match details:** Extra stats in a dedicated modal.
* **Local leaderboard:** Top scores with date, modifiers, and optional “min sets to record” filter.
* **Record management:** Tap a record to view full details; delete individual entries.

### Sharing & Export

* **Share result:** One-tap share (Web Share API when available) or download as PNG.
* **Export layout:** Stats, modifiers, speed chart, and date in a single image (html2canvas).

### Game Modes & Options

* **Auto Shuffle:** Refreshes the board when no set is left.
* **Prevent Bad Shuffle:** Disables shuffle while a valid set is still present.
* **Synchronized Seed (Fixed Seed):** Same deck for everyone (kinda online mode).
* **Auto Select 3rd:** When two cards form a set with a third on the board, the third is auto-selected.

### Persistence

* **LocalStorage:** All settings, keybinds, colors, app width, and records are saved and restored between sessions.

---

## 📖 The Rules of Set

A **Set** is **three cards** where each of the four attributes is **either all the same or all different**. If any attribute fails this rule, it is not a set.

### The Four Attributes

1. **Color:** Red, Green, or Blue.
2. **Shape:** Triangle, Circle, or Square.
3. **Number:** 1, 2, or 3 symbols.
4. **Shading (Fill):** Solid, Striped, or Empty (outline only).

> **Valid Set example**
> * **Card 1:** Two Red Solid Circles  
> * **Card 2:** Two Green Solid Triangles  
> * **Card 3:** Two Blue Solid Squares  
> *Result: Valid — Number and Shading same; Color and Shape all different.*

---

## 🎮 Controls

### Desktop (default keybinds)

| Action            | Default  |
|-------------------|----------|
| Select card by slot | `E` `R` `I` `O` `D` `F` `K` `L` `X` `C` `M` `,` (slots 1–12) |
| Shuffle board     | `Space`  |
| Shuffle deck      | `Backspace` |
| Finish game       | `Enter`  |

All of these can be changed in **Settings → Edit Keybinds**.

### Mobile

* **Tap** a card to select or deselect.
* **Swipe up** in the bottom swipe zone to shuffle the cards currently on the board.

---

## 🛠 Tech Stack

* Vanilla JS, HTML, CSS.
* [Tailwind CSS](https://tailwindcss.com/) (CDN), [Chart.js](https://www.chartjs.org/), [html2canvas](https://html2canvas.hertzen.com/).
* LocalStorage for settings, keybinds, and records.
* Responsive layout with optional resizable width.

---

## 📁 Project Layout

Logic and UI are split across modules: `constants.js`, `state.js`, `storage-module.js`, `game-logic.js`, `graphics-rendering.js`, `settings.js`, `modal-management.js`, `results-stats.js`, `keybinds.js`, `color-picker.js`, `resizer.js`, `event-listeners.js`, `timer.js`, `utilities.js`.
