# 👁️‍🗨️ WinkPass Enterprise™ (Defense Edition v4.2)
> *"Aggressively over-engineered, military-grade biometric zero-trust ocular authentication... for something literally anyone could just watch you do."*

---

## ⚡ Quick Demo Overview

**WinkPass** is a satirical yet technically real biometric authentication system. Instead of typing an alphanumeric password, the user authenticates with an ocular gesture sequence (e.g. `[LEFT WINK] -> [RIGHT WINK] -> [LEFT WINK] -> [DOUBLE WINK]`).

Underneath the hood, it features:
- **Google MediaPipe Face Mesh AI**: Tracks 468 3D facial landmarks in real-time at 60 FPS in the browser.
- **Eye Aspect Ratio (EAR) Geometry**: Dynamically calculates the eyelid opening ratio to detect left vs right winks.
- **Gesture State Machine & Temporal Debounce**: Distinguishes intentional single-eye winks from involuntary double-eye blinks.
- **Military-Grade Cryptographic Digest**: Sequences are salted with a 256-bit cryptoseed and hashed via `SHA-256` / `PBKDF2`.
- **Live Cyber Biometric HUD**: Neon target reticles, real-time EAR telemetry meters, sound synthesis via Web Audio API, and an encrypted audit terminal.

---

## 🚀 How to Run on Windows in VS Code

### Option 1: Direct Browser Launch (Zero Installation)
1. Open the folder `wink-password` in **VS Code**.
2. Right-click on `index.html` and select **"Open with Live Server"** (or simply double-click `index.html` to open in Chrome or Edge).
3. Allow camera permissions when prompted.
4. Wink at the camera!

### Option 2: Full-Stack Python Backend (Flask + REST API)
1. Open terminal in VS Code (`Ctrl + ~`).
2. Run:
   ```bash
   python server.py
   ```
3. Open `http://127.0.0.1:5000` in Chrome or Edge.

---

## 🔑 Default Demo Password Key
- **Default Master Sequence**: `[LEFT WINK] -> [RIGHT WINK] -> [LEFT WINK] -> [BOTH WINK]`
- You can also click the **"ENROLL MASTER KEY"** tab on the dashboard to record your own custom wink sequence live with your eyes!

---

## 📂 Project Architecture & File Layout
```
wink-password/
├── index.html       # Futuristic Cyber HUD & Face Scanner Canvas
├── style.css        # Neon glowing borders, scanlines, and telemetry styling
├── app.js           # MediaPipe AI FaceMesh, EAR calculation, state machine & crypto
├── server.py        # Optional Flask server with SHA-256 verification API
├── README.md        # Documentation and guide
└── .gitignore       # Git ignore rules
```
