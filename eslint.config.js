const js = require("@eslint/js");
const prettier = require("eslint-plugin-prettier/recommended");

module.exports = [
  {
    ignores: [
      "scratch/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "android/**",
      ".vercel/**",
      ".gemini/**",
      "frontend/libs/**"
    ]
  },
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        // Browser Environments
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        location: "readonly",
        alert: "readonly",
        confirm: "readonly",
        FormData: "readonly",
        Blob: "readonly",
        URL: "readonly",
        Image: "readonly",
        HTMLCanvasElement: "readonly",
        indexedDB: "readonly",
        IDBDatabase: "readonly",
        IDBTransaction: "readonly",
        IDBRequest: "readonly",
        IDBIndex: "readonly",
        IDBCursor: "readonly",
        IDBObjectStore: "readonly",
        DOMException: "readonly",
        Notification: "readonly",
        ServiceWorkerRegistration: "readonly",
        PushSubscription: "readonly",
        // Service Worker Globals
        self: "readonly",
        caches: "readonly",
        clients: "readonly",
        registration: "readonly",
        importScripts: "readonly",
        // Third Party Library Globals
        firebase: "readonly",
        gsap: "readonly",
        lucide: "readonly",
        Dexie: "readonly",
        axios: "readonly",
        // Node.js Environments
        process: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        exports: "readonly",
        Buffer: "readonly",
        global: "readonly"
      }
    },
    rules: {
      "prettier/prettier": "warn",
      "no-undef": "warn",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-console": "off",
      "no-empty": "warn",
      "no-useless-escape": "off",
      "no-case-declarations": "off",
      "no-useless-assignment": "off",
      "no-async-promise-executor": "off",
      "preserve-caught-error": "off"
    }
  }
];
