# SocialHub

SocialHub is a full-stack social platform for sharing posts, building connections,
messaging in real time, and hosting live conversations. The project is currently
under active development.

## Features

- JWT authentication and protected routes
- User profiles, avatars, cover photos, bios, and interests
- Posts with image or video attachments
- Post editing, deletion, likes, comments, bookmarks, and sharing
- Personal FaceMoji libraries and custom face reactions
- Reaction details showing who reacted and how
- Connection requests, connection management, and people discovery
- Activity notifications
- Real-time direct and group messaging with presence
- Message attachments, editing, and deletion
- Audio and video calls
- Live post discussion rooms with audio and chat
- Stories with creation, viewing, and reactions
- Explore, hashtags, saved posts, and public profile pages
- Privacy policy, terms, and account-deletion guidance
- Optional AI-assisted grammar, image generation, transcription, and call summaries

## Technology

### Frontend

- Next.js 16
- React 19
- Redux Toolkit and React Redux
- Axios
- Socket.IO Client
- CSS Modules

### Backend

- Node.js and Express 5
- MongoDB and Mongoose
- Socket.IO
- JWT and bcrypt
- Cloudinary and Multer
- Optional Cloudflare Realtime/TURN services
- Optional OpenAI API services

## Project structure

```text
socialHub/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── sockets/
│   └── server.js
└── frontend/
    ├── public/
    └── src/
        ├── components/
        ├── config/
        ├── hooks/
        ├── pages/
        └── styles/
```

## Local development

### Requirements

- Node.js 20 or newer
- npm
- A MongoDB database
- A Cloudinary account

### Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### Backend environment

Create `backend/.env`:

```env
PORT=3001
MONGO_URI=mongodb_connection_string
JWT_SECRET_KEY=replace_with_a_long_random_secret
FRONTEND_URL=http://localhost:3000

CLOUDINARY_CLOUD_NAME=cloud_name
CLOUDINARY_API_KEY=api_key
CLOUDINARY_API_SECRET=api_secret
```

Optional calling and discussion-room configuration:

```env
CLOUDFLARE_TURN_KEY_ID=turn_key_id
CLOUDFLARE_TURN_API_TOKEN=turn_api_token
CLOUDFLARE_REALTIME_APP_ID=realtime_app_id
CLOUDFLARE_REALTIME_APP_SECRET=realtime_app_secret
```

Optional AI configuration:

```env
OPENAI_API_KEY=openai_api_key
OPENAI_GRAMMAR_MODEL=model_name
OPENAI_IMAGE_MODEL=model_name
OPENAI_TRANSCRIPTION_MODEL=model_name
OPENAI_CALL_SUMMARY_MODEL=model_name
```

### Frontend environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PRIVACY_EMAIL=privacy@example.com
NEXT_PUBLIC_STUN_URL=stun:stun.l.google.com:19302
```

The browser origin must exactly match `FRONTEND_URL`. For example,
`http://localhost:3000` and `http://127.0.0.1:3000` are different origins.

### Run the application

Start the backend from its directory so it loads `backend/.env`:

```bash
cd backend
npm run dev
```

In another terminal, start the frontend:

```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

Backend:

```bash
npm run dev    # Start with nodemon
npm start      # Start with Node.js
```

Frontend:

```bash
npm run dev    # Start the Next.js development server
npm run build  # Create a production build
npm start      # Run the production build
npm run lint   # Run ESLint
```

## API overview

The Express API includes routes for:

- Authentication and profiles
- Posts, comments, bookmarks, and reactions
- FaceMoji libraries
- Connections and notifications
- Conversations and messages
- Calls and live discussion rooms
- Stories
- AI-assisted media and text operations

REST routes require an `Authorization: Bearer <token>` header unless noted
otherwise. Socket.IO connections authenticate using the same JWT in the socket
handshake.

## Media uploads

Post, message, and FaceMoji media use signed direct uploads to Cloudinary. The
backend creates upload signatures and verifies the resulting asset identifiers
before saving them. This keeps large files out of the Express request path while
preserving ownership checks.

## Current status

SocialHub is a working development-stage application. Core flows have been
manually tested, but broader automated coverage, reaction pagination, moderation,
and production deployment hardening are still planned.

## Author

Dipen Bhandari
