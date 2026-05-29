# Contributing to Consistency Tracker ⚡

Thank you for your interest in contributing to Consistency Tracker! We are excited to build this public, offline-first personal productivity and squad accountability hub together.

To ensure a smooth, collaborative workflow, please read and follow these guidelines.

---

## 🛠️ Local Development Setup

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18.x or higher; Node 22 is recommended)
*   [MongoDB](https://www.mongodb.com/try/download/community) (either local instance or MongoDB Atlas cluster)

### 2. Fork & Clone
1. Fork this repository to your own GitHub account.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/consistency.git
   cd consistency
   ```

### 3. Backend Server Setup
1. Install project dependencies in the root directory:
   ```bash
   npm install
   ```
2. Copy the `.env.example` template to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Open `.env` and fill in your local port, database connections, and integrations.
4. Launch the local backend developer server:
   ```bash
   npm run dev
   ```

### 4. AI Microservice Setup
1. Navigate to the `ai-service` directory:
   ```bash
   cd ai-service
   npm install
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Set your **Groq API Key** and shared AI Secret inside `.env`.
4. Start the AI service:
   ```bash
   npm start
   ```

---

## 🎨 Design System & Code Style

Consistency Tracker is built with vanilla HTML5, CSS, and JS (ES Modules) to keep load times lightning-fast. To maintain consistency, all UI contributions must conform to our styling and linting configurations.

### 1. Styling Guidelines (Neo-Brutalist Theme)
Our app features a loud, bold, Neo-Brutalist aesthetic. Ensure any new UI elements align with:
*   **Palette:** High-contrast background variables:
    *   Yellow: `#FFD60A` (`var(--yellow)`)
    *   Pink: `#FF3EA5` (`var(--pink)`)
    *   Teal: `#00C9A7` (`var(--teal)`)
    *   Lime: `#B5FF4D` (`var(--lime)`)
    *   Coral: `#FF6B35` (`var(--coral)`)
*   **Borders:** Thick solid black borders for cards and inputs: `4px solid #000000`.
*   **Shadows:** Flat, offset solid black drop shadows: `box-shadow: 8px 8px 0px #000000;`. Hover translates buttons up/left: `transform: translate(-3px, -3px); box-shadow: 11px 11px 0px #000000;`.
*   **Typography:** Space Grotesk (for headers) and Inter (for body text).

### 2. Linting and Formatting
Before committing code, verify it compiles and formats properly:
*   **Lint Check:** Run ESLint rules to identify syntax and warning issues:
    ```bash
    npm run lint
    ```
*   **Prettier Formatting:** Prettier formats all files automatically according to the project style:
    ```bash
    # Check formatting status
    npm run check-format
    
    # Auto-format files
    npm run format
    ```

---

## 🤝 Branching & Pull Requests

### 1. Feature Branches
Always create a descriptive branch for your changes:
```bash
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b bugfix/issue-description
```

### 2. Committing
Keep commit messages clear, concise, and structured:
```
feat(fcm): add group chat notification mute support
fix(scratchpad): resolve GPU black canvas resizing glitch on mobile
docs(readme): add installation details for AI microservice
```

### 3. Opening Pull Requests
1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
2. Open a Pull Request against our `main` branch.
3. Fill out the Pull Request template completely.
4. **CI checks & AI reviews:** GitHub Actions CI will automatically run linting and format verification. CodeRabbit AI will also automatically write comments and review suggestions on your PR. Resolve any errors or review warnings.
