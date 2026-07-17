# Max Strength App - Features & Progress Tracker

This document serves as a comprehensive overview of the Max Strength application. It is designed to be easily readable for presentations (like Google Slides) or ingested by AI tools (like NotebookLM) to understand the full scope of the app. It also includes a Quality Assurance (QA) section to track remaining tasks.

## 📋 Core Dashboards & Features

### 1. Trainer Control Hub
The central command center for trainers to manage their environment and settings.
*   **Hardware Settings**: Manage equipment, machine seat settings, and calibration.
*   **App Settings**: Admin-level configurations for the app experience (Theme, Franchise specifics).
*   **Data Exports & Reporting**: Download CSV reports for trainer performance, payroll summaries, and client attendance logs.
*   **Notifications & Alerts**: Configure automated SMS/email booking reminders and owner daily action summaries.
*   **Integrations & Webhooks**: Centralized pane to manage API credentials (e.g., Mindbody), toggle auto-sync polling intervals, and monitor connection health and sync logs.
*   **Announcements**: Create and view studio-wide announcements.

### 2. Client Directory & Profiles
Comprehensive management of client relationships, health data, and progression.
*   **Client Onboarding**: Setup wizards for new clients, recording demographics, injuries, and goals.
*   **Health & Body Tracking**: Track weight, body fat %, skeletal muscle mass, and subjective feel (energy/sleep).
*   **Clinical Review**: Pre-session review of client history, injury notes, and recent performance drops.
*   **Progress Reports**: Visual charts depicting strength gains over time, broken down by demographics and muscle groups.

### 3. Active Session & Routine Builder
The core workout execution and planning engine.
*   **Routine Builder**: Drag-and-drop tool to queue up machines, set target weights/reps, and define rest periods.
*   **Active Session HUD**: Real-time timer, dynamic execution sequences, and live tracking of Weight, Reps, and RPE (Rate of Perceived Exertion).
*   **Machine Setup**: Auto-displays the client's saved seat and pin settings for fast transitions between machines.

### 4. Post-Session Briefing (Victory HUD)
Gamified recap screen displayed immediately after a workout concludes.
*   **Performance Metrics**: Total tonnage lifted, total duration, and intensity score.
*   **Personal Records (PRs)**: Highlights new max weight or volume milestones achieved during the session.
*   **Progression Visualizer**: Shows today's performance compared to historical averages.

### 5. Machine Anatomy Catalog
Educational and strategic tool for targeting specific muscle groups.
*   **Interactive Body Map**: Visual representation of the human body to highlight primary and synergist muscles.
*   **Catalog**: Comprehensive directory of all studio machines, linked to the specific muscles they train.
*   **Filters & Search**: Quickly find alternative machines based on client injuries or occupied equipment.

### 6. Admin & Franchise Management
Tools for studio owners and regional managers.
*   **Multi-Studio Management**: Switch between different locations, view aggregated metrics, and manage location-specific overrides.
*   **User Directory**: Invite trainers, assign roles (Admin, Studio Leader, Trainer), and manage permissions.
*   **Analytics Dashboard**: High-level views of retention rates, revenue, and utilization.

---

## ✅ Quality Check & To-Do List

Use this checklist to track pending features, bugs, and final polish items.

### High Priority
- [ ] **Data Persistence Check**: Ensure all newly added settings (Notifications, Auto-sync) correctly save to Firestore.
- [ ] **OAuth / Webhook E2E Testing**: Verify real-time schedule syncing with Mindbody using actual webhook payloads.
- [ ] **Mobile Responsiveness**: Audit the Integrations Hub and Data Exports tabs on small screens to ensure no horizontal scrolling issues.

### Medium Priority
- [ ] **CSV Export Logic**: Implement the actual CSV generation and download functionality for the new Data & Reports tab.
- [ ] **Email/SMS Triggering**: Connect the UI toggles in "Alerts & Comms" to the backend cloud functions for dispatching messages.
- [ ] **Error Boundary Polish**: Ensure gracefully handled fallbacks if external API connections fail during active sessions.

### Low Priority / Nice-to-Have
- [ ] **Custom App Themes**: Allow users to define custom HEX codes for franchise branding.
- [ ] **Enhanced Animations**: Add subtle enter/exit animations to the Bento Stat Tiles on the Victory HUD.
- [ ] **Expanded Anatomy Data**: Further refine the synergist vs. primary muscle mappings for obscure equipment.
