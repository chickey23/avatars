# Avatars API

Phase 6: Web companion backend. The same React UI can run against this API when deployed as a web app.

## Endpoints

- `GET /api/context` - Get current situation context
- `GET /api/avatars` - List primary avatars
- `POST /api/message` - Send message, body: `{ content, selectedAvatarIds, focus? }`
- `POST /api/tasks` - Assign task, body: `{ avatarId, title, description? }`
- `GET /api/tasks?avatarId=...` - Get tasks for avatar

## Implementation

To implement the backend, use Node/Express, Fastify, or similar. The Tauri desktop app uses local store; the web companion would use this API with the same UI.
