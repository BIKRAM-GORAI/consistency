# <div align="center"><span style="color: #2563eb;">⚡ Consistency Daily ⚡</span><br><sub>Habit Tracking &bull; Distraction Blocking &bull; Squad Accountability &bull; AI Coaching</sub></div>

---

<div align="center">

[![Tech Stack: Node.js](https://img.shields.io/badge/Backend-Node.js%20%2F%20Express-teal?style=for-the-badge&logo=nodedotjs&logoColor=white)](#)
[![Tech Stack: MongoDB](https://img.shields.io/badge/Database-MongoDB%20%2F%20Mongoose-green?style=for-the-badge&logo=mongodb&logoColor=white)](#)
[![Tech Stack: Firebase](https://img.shields.io/badge/Realtime-Firebase%20%2F%20FCM-orange?style=for-the-badge&logo=firebase&logoColor=white)](#)
[![Platform: Mobile PWA / Android](https://img.shields.io/badge/Mobile-Android%20%2F%20Capacitor-blue?style=for-the-badge&logo=android&logoColor=white)](#)

### [🚀 Live Web App](https://consistency-daily.vercel.app) &nbsp;&bull;&nbsp; [📱 Download Android APK](https://raw.githubusercontent.com/BIKRAM-GORAI/consistency-daily-apk/main/Consistency.Daily.apk)

</div>

---

## 📖 Table of Contents
- [✨ Core Features](#-core-features)
- [🎨 Beautiful UI Themes](#-beautiful-ui-themes)
- [🏗️ System Architecture](#️-system-architecture)
- [🔄 Offline Synchronization Engine](#-offline-synchronization-engine)
- [🛠️ Tech Stack & Technologies](#️-tech-stack--technologies)
- [💻 Local Installation & Run Guide](#-local-installation--run-guide)
- [🔒 Security & Sensitive Configs](#-security--sensitive-configs)
- [🤝 Contributing Guidelines](#-contributing-guidelines)

---

## ✨ Core Features

<table>
  <tr>
    <td width="30%"><strong>📅 Daily Habit Cards</strong></td>
    <td>Log habits dynamically inside custom task lists. View daily completion percentages with rich progress rings.</td>
  </tr>
  <tr>
    <td><strong>🔥 Streaks & Milestones</strong></td>
    <td>Log tasks daily to keep streaks active. Highlights milestone cards with specialized styling (indigo/lavender for 7-day wraps and pink/gold for 30-day elite logs).</td>
  </tr>
  <tr>
    <td><strong>🎨 Time-Lapse Scratchpad</strong></td>
    <td>Sketch concepts on a dedicated canvas scratchpad. Save drawings offline and replay drawing logs using custom animated speed controls.</td>
  </tr>
  <tr>
    <td><strong>💬 Squad Chat & Direct Messages</strong></td>
    <td>Real-time chat rooms and direct messages with text formatting, stickers, image sharing, and online presence tracking. Supports stacked native push notifications via Firebase Cloud Messaging (FCM).</td>
  </tr>
  <tr>
    <td><strong>🏆 Leaderboard Showcase & Privacy</strong></td>
    <td>Toggle leaderboard opt-in (`showOnLeaderboard`) or showcase profiles privately. Opting out allows users to track their rank privately via a floating mobile rank card. Search is unified so private profiles are searchable but detail cards are locked.</td>
  </tr>
  <tr>
    <td><strong>🤖 Groq AI Summary Coach</strong></td>
    <td>Extract daily task performance, distraction metrics, and streaks to generate custom coach advice powered by Llama 3.3.</td>
  </tr>
  <tr>
    <td><strong>💻 LeetCode Integration</strong></td>
    <td>Link LeetCode user accounts to auto-verify solved challenge stats and check off corresponding habit cards automatically. Run via optimized background sync crons to prevent Vercel function timeouts.</td>
  </tr>
</table>

---

## 🎨 Beautiful UI Themes

Consistency Daily ships with **5 custom UI layouts** to suit any aesthetic preference:

* <span style="background-color: #ffd60a; color: #000; padding: 2px 6px; border: 2px solid #000; font-weight: bold; border-radius: 4px;">Neo-Brutalist Light</span>: High-contrast layout featuring raw bold borders (`4px solid #000`), flat drop-shadows, and primary retro highlights.
* <span style="background-color: #1e1e1e; color: #fff; padding: 2px 6px; border: 2px solid #333; font-weight: bold; border-radius: 4px;">Dark Mode</span>: Sleek dark obsidian elements with high-contrast pastel text overlays to minimize eye strain.
* <span style="background-color: #ffffff; color: #000; padding: 2px 6px; border: 2px solid #ccc; font-weight: bold; border-radius: 4px;">Minimalistic</span>: High-fashion, low-noise layout featuring ultra-thin lines, spacious margins, and pure monochrome structure.
* <span style="background-color: #e8f7ef; color: #105032; padding: 2px 6px; border: 2px solid #b5e2c9; font-weight: bold; border-radius: 4px;">Claymorphism Mode</span>: Premium pastel gradients combined with inner glassmorphic highlights and soft outer depth.
* <span style="background-image: linear-gradient(135deg, #4c1d95, #be185d); color: #fff; padding: 2px 6px; border: 1px solid rgba(255,255,255,0.2); font-weight: bold; border-radius: 4px;">Premium Aurora Glass Mode</span>: Modern glassmorphism UI styles with 24px blur backdrop filters, custom action color palettes, and floating radial gradient backgrounds.

---

## 🏗️ System Architecture

Consistency Daily is designed as a secure, distributed application. The architecture separates client storage, web/app execution, and background workers to ensure lightning-fast loading speeds.

### Architecture Topology

```mermaid
graph TD
    subgraph Client ["Client (PWA / Installed App)"]
        UI["UI Layer (GSAP, CSS Stylesheets, Lucide Icons)"]
        SyncEngine["Dexie.js Sync Engine (IndexedDB Local DB)"]
        FCM_Client["FCM Background Messaging Sw"]
    end

    subgraph Backend ["Vercel API Gateway (Express / Node.js)"]
        Router["Express Server Routing"]
        Auth["JWT Verification & Rate Limiting"]
        AdminSDK["Firebase Admin SDK Connector"]
    end

    subgraph CoreDB ["Primary Databases"]
        Mongo[("MongoDB Cluster (Users, Days, Groups)")]
        Cloudinary["Cloudinary API (Profile & Group Icons)"]
    end

    subgraph AI_Core ["AI Coaching Service (Render Node)"]
        Proxy["HMAC API Verification Layer"]
        Groq["Groq API (Llama 3.3 / Gemini Lite)"]
    end

    %% Connection mappings
    UI -->|1. Write cache| SyncEngine
    UI -->|2. Network Calls| Router
    Router -->|Verify Session| Auth
    Router -->|Store Data| Mongo
    Router -->|Retrieve AI summaries| Proxy
    Proxy -->|Generate Coach Prompts| Groq
    Router -->|Live Chat Sync| AdminSDK
    AdminSDK -->|Dispatch Notification payload| FCM_Client
```

---

## 🔄 Offline Synchronization Engine

To support offline capability, the application runs a state-machine that logs edits locally and reconciles with the database once the internet connection returns.

### Sync Lifecycle Flow

```mermaid
stateDiagram-v2
    [*] --> OnlineIdle : Internet Connected
    OnlineIdle --> OfflineState : Connection Dropped

    state OfflineState {
        [*] --> CacheWrite : Edit tasks / draw scratchpad
        CacheWrite --> SyncQueue : Write mutation record to Dexie.js queue
    }

    OfflineState --> Reconnecting : Connection Restored

    state Reconnecting {
        [*] --> ProcessQueue : Read Dexie.js queue entries sequentially
        ProcessQueue --> ServerSync : API POST/PATCH request
        ServerSync --> ConflictCheck : Handle potential server state conflicts
        ConflictCheck --> ClearQueue : Remove entry from local queue on success
    }

    Reconnecting --> OnlineIdle : Queue Empty
```

---

## 🛠️ Tech Stack & Technologies

### Frontend Core
* **HTML5 / Vanilla JavaScript**: Modular ES6 modules for optimized loading without framework overhead.
* **Vanilla CSS**: Neo-brutalist, Claymorphic, and Dark systems driven by CSS variables and utility variables.
* **Dexie.js (IndexedDB)**: Wrapper providing query capabilities for caching tasks, scratchpads, and profiles.
* **GSAP (GreenSock)**: Micro-interaction animations and custom transition libraries.

### Backend Core
* **Node.js & Express**: API layer handling routing, authentication, and database requests.
* **Mongoose & MongoDB**: Object modeling schema mapping to Mongo collections.
* **Firebase Suite**: Real-time Firebase Firestore database for instant chat messaging and direct chats.

### Integrations
* **Groq API & Llama 3.3**: High-speed LLM integration proxying structured summaries from user metrics.
* **Google Gemini API**: Cognitive engine driving personality traits, focus comments, and memory logs.
* **Firebase Cloud Messaging (FCM)**: Real-time native push engine with service worker hooks.
* **Cloudinary SDK**: Remote media hosting with optimization constraints.

---

## 💻 Local Installation & Run Guide

### 1. Prerequisites
Install **Node.js** (v18+) and **MongoDB** (Local Community Server or Atlas URL).

### 2. Clone Project
```bash
git clone https://github.com/BIKRAM-GORAI/consistency.git
cd consistency
```

---

### 3. Primary Server & Web Frontend Setup
Install dependencies in the root directory:
```bash
npm install
```

Create a `.env` file in the root directory by copying the example:
```bash
cp .env.example .env
```

Configure the root `.env` variables:
```ini
# --- Database & Port ---
MONGO_URI=your_mongodb_connection_string
PORT=your_port_number
FRONTEND_URL=your_frontend_url

# --- Security & JWT Sessions ---
JWT_SECRET=your_jwt_signing_key_here
JWT_EXPIRY=your_jwt_expiry_here
JWT_ACCESS_EXPIRY=your_jwt_access_expiry_here
JWT_REFRESH_EXPIRY=your_jwt_refresh_expiry_here
CRON_SECRET=your_cron_secret_here

# --- Email (SMTP Configuration via Gmail) ---
GMAIL_EMAIL=your_gmail_address_here
GMAIL_APP_PASSWORD=your_gmail_app_specific_password_here

# --- Firebase Service Account Credentials ---
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="your_firebase_private_key_here"

# --- Cloudinary Asset Management ---
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# --- Administrative Credentials ---
ADMIN_EMAIL=your_admin_email_here
ADMIN_PASSWORD=your_admin_password_here
ADMIN_OTP_RECIPIENT_EMAIL=your_admin_otp_recipient_email_here
ADMIN_BACKUP_OTP=your_admin_backup_otp_here

# --- AI Microservice Configuration ---
AI_SERVICE_URL=your_ai_service_url_here
AI_SERVICE_SECRET=your_shared_hmac_secret_here
```

Start the development server:
```bash
npm run dev
```

---

### 4. AI Coaching Service Setup
Navigate to the `ai-service` folder:
```bash
cd ai-service
npm install
```

Create `.env` inside `ai-service`:
```bash
cp .env.example .env
```

Configure `.env` inside the `ai-service` directory:
```ini
PORT=your_ai_service_port
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=your_groq_model_here
AI_SERVICE_SECRET=your_shared_hmac_secret_here
JWT_SECRET=your_jwt_signing_key_here
GEMINI_MODEL=your_gemini_model_here
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_CANVAS_API_KEY=your_gemini_canvas_api_key_here
MONGO_URI=your_mongodb_connection_string
CRON_SECRET=your_cron_secret_here
```

Run the service:
```bash
npm start
```

---

## 🔒 Security & Sensitive Configs

* **Session Validation**: All data-modification routes require cryptographic JSON Web Tokens (JWT) signed using a server-side secret.
* **AI Service Handshake**: The main Express backend and the AI coaching microservice authenticate requests using an **HMAC (Hash-based Message Authentication Code)** signature generated from a shared `AI_SERVICE_SECRET`.
* **Database Sanitization**: Inputs are sanitized against XSS and Mongo Injection vectors. Route access is guarded by `express-rate-limit` limits.

---

## 🤝 Contributing Guidelines

We love community updates! To help us keep the code style consistent:

1. **Fork the Repository** and push code to your feature branch (`feature/amazing-feature`).
2. **Brutalist Style Guide**: Keep margins bold, use high-contrast primary buttons, and enforce raw black borders (`4px solid #000`) for regular themes.
3. **No Frameworks**: Keep the source code dependencies clean. Avoid adding large frameworks like React, Vue, TailwindCSS, or Bootstrap.
4. **Offline Preservation**: When modifying models or state transitions, ensure you update Dexie/IndexedDB schemas accordingly to prevent offline cache synchronization collisions.
