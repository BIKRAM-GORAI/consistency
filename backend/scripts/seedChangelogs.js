const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Changelog = require('../models/Changelog');

const seeds = [
  {
    message: "App Launch - Consistency Tracker goes live! Track your daily habits, build streaks, and stay motivated.",
    type: "minor",
    createdAt: new Date("2026-04-08T10:00:00Z")
  },
  {
    message: "Secure authentication flow with login/register features and fully responsive mobile layouts.",
    type: "major",
    createdAt: new Date("2026-04-10T14:30:00Z")
  },
  {
    message: "Shared Team Groups - Create or join groups to collaborate, view members' daily progress, and stay consistent together.",
    type: "major",
    createdAt: new Date("2026-04-11T16:00:00Z")
  },
  {
    message: "Visual Redesign - Rollout of the bold, high-contrast Neo-Brutalism theme featuring flat elements and prominent dark shadows.",
    type: "major",
    createdAt: new Date("2026-04-21T09:00:00Z")
  },
  {
    message: "Achievements system - Unlock status ranks and configure achievement privacy toggles from your profile.",
    type: "minor",
    createdAt: new Date("2026-04-21T11:45:00Z")
  },
  {
    message: "Daily email notifications - Set automated reminders to claim and check off your daily streak tasks.",
    type: "minor",
    createdAt: new Date("2026-04-23T18:20:00Z")
  },
  {
    message: "Custom Profile Configuration - Update settings, change display names, and customize preferences.",
    type: "minor",
    createdAt: new Date("2026-04-24T15:00:00Z")
  },
  {
    message: "Saved Templates - Save custom templates of daily lists to quickly populate your active day cards.",
    type: "minor",
    createdAt: new Date("2026-04-25T08:30:00Z")
  },
  {
    message: "Dark Brutalist Theme - Complete dark mode support for high-contrast Neo-Brutalist visual design.",
    type: "major",
    createdAt: new Date("2026-04-25T10:00:00Z")
  },
  {
    message: "Contribution Grid Graphs - GitHub-style habit activity heatmaps added, alongside username search directory.",
    type: "minor",
    createdAt: new Date("2026-04-25T13:45:00Z")
  },
  {
    message: "Profile photo uploads supported with seamless Cloudinary hosting integration.",
    type: "minor",
    createdAt: new Date("2026-04-25T16:15:00Z")
  },
  {
    message: "Live LeetCode Integration - Connect your LeetCode profile directly to automatically sync daily programming statistics.",
    type: "major",
    createdAt: new Date("2026-05-02T12:00:00Z")
  },
  {
    message: "Social Logins - Log in securely using Google OAuth 2.0 social login buttons.",
    type: "major",
    createdAt: new Date("2026-05-03T11:00:00Z")
  },
  {
    message: "Progressive Web App (PWA) - Full support to 'Install as App' on mobile home screens with offline caching capabilities.",
    type: "minor",
    createdAt: new Date("2026-05-03T15:30:00Z")
  },
  {
    message: "Public Groups Directory - Search for and join public team groups directly without needing invite codes.",
    type: "minor",
    createdAt: new Date("2026-05-05T10:30:00Z")
  },
  {
    message: "Global Leaderboard - Showcase rankings by streak values, with public shareable user profiles.",
    type: "major",
    createdAt: new Date("2026-05-06T09:00:00Z")
  },
  {
    message: "Claimable badges - Unlock and show off dynamic streak milestones (Verified, Beta Tester, and Custom Day milestones).",
    type: "minor",
    createdAt: new Date("2026-05-06T11:30:00Z")
  },
  {
    message: "Live Team Chat - Real-time websocket chat rooms launched for all team groups.",
    type: "major",
    createdAt: new Date("2026-05-06T17:00:00Z")
  },
  {
    message: "Multimedia Chats - Support for voice notes, audio files, and image attachments within team chat rooms.",
    type: "major",
    createdAt: new Date("2026-05-09T14:00:00Z")
  },
  {
    message: "Video Call Rooms - Screen sharing, video calling, and interactive team meetings directly in your group rooms.",
    type: "major",
    createdAt: new Date("2026-05-10T19:30:00Z")
  },
  {
    message: "Privacy Settings - Fine-grained user search and directory discoverability configurations added.",
    type: "minor",
    createdAt: new Date("2026-05-21T10:00:00Z")
  },
  {
    message: "Quick Scratchpad - A persistent scratchpad area to jot down quick thoughts directly on your day cards.",
    type: "minor",
    createdAt: new Date("2026-05-21T15:15:00Z")
  },
  {
    message: "Grace Periods - Dynamic 5-day grace period rules to prevent long-term goal breakages.",
    type: "minor",
    createdAt: new Date("2026-05-25T11:00:00Z")
  },
  {
    message: "Push Notifications - Integrated Firebase Web Push Notifications for live chat alerts, reminders, and streaks.",
    type: "major",
    createdAt: new Date("2026-05-25T16:30:00Z")
  },
  {
    message: "AI OCR Scanning & Voice - Add daily items with voice input, and scan tasks directly from images via OCR.",
    type: "major",
    createdAt: new Date("2026-06-08T10:00:00Z")
  },
  {
    message: "Aurora Glass Theme - Beautiful glassmorphic UI styling with rich gradients, frosted panels, and animated glows.",
    type: "major",
    createdAt: new Date("2026-06-08T18:00:00Z")
  },
  {
    message: "Minimalistic Theme - High performance, lightweight theme with thin borders and soft shadows for speed and utility.",
    type: "major",
    createdAt: new Date("2026-06-09T15:00:00Z")
  }
];

async function seed() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Clearing existing changelogs...");
  await Changelog.deleteMany({});
  console.log("Seeding historical changelogs...");
  await Changelog.insertMany(seeds);
  console.log("Seeding complete! Disconnecting...");
  await mongoose.disconnect();
  console.log("Done.");
}

seed().catch(err => {
  console.error("Error during seeding:", err);
  process.exit(1);
});
