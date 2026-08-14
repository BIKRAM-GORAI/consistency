# Consistency Daily Developer Hub & Voice Agent Plan

This plan documents the technical details, feasibility, and implementation steps to transform **Consistency Daily** into the ultimate developer productivity hub. It integrates direct developer tools (GitHub, LeetCode), calendar sync (Google Calendar), system alerts/alarms, home-screen widgets, a personalized voice-controlled action agent, and an interactive Gemini assistant.

---

## Feasibility & Complexity Analysis

Before implementation, we analyze the feasibility of these features on **Web (PWA)** and **Android (Capacitor Mobile App)**:

| Feature | Web (PWA) Feasibility | Android (Capacitor) Feasibility | Complexity | Technical Approach |
| :--- | :--- | :--- | :--- | :--- |
| **GitHub Integration** | Fully Feasible | Fully Feasible | **Medium** | Connect via GitHub API, fetch repositories, and use background sync checks to check off habit cards. |
| **Google Calendar Bi-directional Sync** | Fully Feasible | Fully Feasible | **High** | Implement Google OAuth2 flow on the backend. Store access tokens to query calendar events and sync tasks. |
| **Web Speech Voice Agent** | Fully Feasible | Fully Feasible | **Medium** | Use the browser's built-in `SpeechRecognition` API (Web Speech API) for real-time transcription, then parse intent using Gemini. |
| **"Hey Gemini" Voice Trigger** | Limited (App must be open/focused to hear) | Feasible (Via Android App Actions / Assist Intents) | **High** | On Android, configure Android Intents (`actions.xml`) to launch the app via Google Assistant commands. |
| **Home Screen Widgets** | Not Feasible (PWAs do not support native widgets) | Fully Feasible (Via Capacitor plugins or Native Java Widget Provider) | **High** | Implement a native Android Widget Provider that queries the Capacitor local SQLite/IndexedDB database. |
| **Local Alarms & Reminders** | Feasible (Web Push & Notification API) | Fully Feasible (Capacitor `LocalNotifications`) | **Medium** | Register schedule alarms that trigger push notifications/sounds even when the app is minimized. |

---

## User Review Required

> [!IMPORTANT]
> **Voice Trigger Limitation**: Standard web browsers do not allow background voice monitoring (wake-words like "Hey Gemini") when the tab is closed, due to OS-level privacy locks. For PWAs, voice control requires tapping a "Quick Mic" button. For Android, it uses the "Hey Google, open Consistency" system shortcut.

> [!WARNING]
> **Android Widget Implementation**: Native home-screen widgets require compilation edits inside the `/android` directory of the project, defining an `AppWidgetProvider` class in Java/Kotlin.

---

## Proposed Changes

We divide the implementation into three key layers: **Frontend**, **Backend**, and **Android Native Configuration**.

---

### 1. Frontend Component

#### [NEW] [voiceAgent.js](file:///c:/Desktop/todo-ai/frontend/js/modules/voiceAgent.js)
*   **Web Speech Recognition**: Initialize `window.SpeechRecognition` or `window.webkitSpeechRecognition`.
*   **Intent Extraction**: Pass transcriptions to Gemini via a new `/api/ai/parse-voice-intent` route.
*   **Action Execution Matrix**:
    *   `CREATE_TASK`: Instantly add cards to local Dexie DB and render them.
    *   `CHECK_TASK`: Search active lists for matches and execute task completion animation (confetti).
    *   `SEND_MESSAGE`: Identify the friend's name, switch tabs to Messages, and post the message.
    *   `SWITCH_THEME`: Change app visual theme instantly.
    *   `TRIGGER_FOCUS`: Launch the Pomodoro timer.

#### [NEW] [integrations.js](file:///c:/Desktop/todo-ai/frontend/js/modules/integrations.js)
*   Render the developer connection panel.
*   Manage GitHub connection status and list user repositories.
*   Connect Google Calendar OAuth and render the daily schedule panel on the dashboard.

#### [MODIFY] [index.html](file:///c:/Desktop/todo-ai/frontend/index.html)
*   Add a **Floating Quick Mic Button** (`#floating-mic-btn`) at the bottom right corner with a glowing aura indicator.
*   Inject the **Voice Agent Overlay** containing live transcript text and Gemini's verbal feedback waveform.
*   Add the **Developer Hub Tab** containing GitHub repos, linked calendar events list, and active integrations settings.

#### [MODIFY] [style.css](file:///c:/Desktop/todo-ai/frontend/style.css)
*   Add styling for the integrations dashboard, speech waveform animation, command-floating bubble, and glassmorphic calendar lists.

---

### 2. Backend Component

#### [NEW] [googleCalendarRoutes.js](file:///c:/Desktop/todo-ai/backend/routes/googleCalendarRoutes.js)
*   OAuth callback URLs (`/api/integrations/google/connect`, `/api/integrations/google/callback`).
*   Calendar sync routes (`GET /api/integrations/google/events`, `POST /api/integrations/google/create-event`).

#### [NEW] [githubRoutes.js](file:///c:/Desktop/todo-ai/backend/routes/githubRoutes.js)
*   GitHub token verification and repo list fetching.
*   Cron endpoint `/api/integrations/github/sync` to check commits periodically and trigger habit completions.

#### [MODIFY] [aiRoutes.js](file:///c:/Desktop/todo-ai/backend/routes/aiRoutes.js)
*   Add the intent parser route `/api/ai/parse-voice-intent`. It uses Gemini with a structured system instruction: *"You are an OS agent. Analyze the user statement and return a strictly structured JSON containing the action and params."*

#### [MODIFY] [User.js](file:///c:/Desktop/todo-ai/backend/models/User.js)
*   Add integration credential storage:
    *   `githubUsername` (String), `githubToken` (Encrypted string)
    *   `googleOAuthTokens` (Object: access_token, refresh_token, expiry)

---

### 3. Android Native Component (Capacitor)

#### [NEW] [AppWidget.java](file:///c:/Desktop/todo-ai/android/app/src/main/java/app/consistency/daily/AppWidget.java)
*   Create a Java class extending `AppWidgetProvider` that draws a custom remote layout displaying the list of unchecked daily tasks.
*   Configure an intent receiver so clicking a checkbox sends a broadcast that updates the local app database and updates the widget layout.

#### [MODIFY] [AndroidManifest.xml](file:///c:/Desktop/todo-ai/android/app/src/main/AndroidManifest.xml)
*   Register the `AppWidgetProvider` receiver.
*   Configure Google Assistant actions (`actions.xml`) to register voice intent hooks.

---

## Verification Plan

### Automated Tests
1.  **AI Voice Intent Unit Test**: Mock transcripts ("add workout task to daily cards", "check off leetcode habit") and verify the returned JSON actions matches the schemas.
2.  **OAuth Sync Check**: Mock tokens to verify GitHub REST API commit checks and Google Calendar event insertion.

### Manual Verification
1.  **Voice Agent Test**: Tap the mic button, speak "complete coding task", verify that the speech is transcribed on-screen, processed by Gemini, and checks off the card with confetti.
2.  **Calendar Sync Test**: Add a habit deadline, click sync, and verify that it appears instantly inside Google Calendar.
3.  **Android Widget Test**: Build apk, add widget to home screen, click check-off, open the app, and verify that the habit card is checked.
