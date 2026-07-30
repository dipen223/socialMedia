# Ripple

Ripple is a full-stack social media platform where people can create accounts,
share posts,and manage their profiles.

## Features

- User authentication (JWT)
- Secure password hashing with bcrypt
- Profile picture upload
- Create and manage profiles
- Responsive React UI
- MongoDB database
- Protected API routes

## Tech Stack

### Frontend
- React
- Vite
- Tailwind CSS
- React Router
- Axios

### Backend
- Node.js
- Express
- MongoDB
- Mongoose
- JWT
- bcrypt
- Multer
- Cloudinary

## Screenshots

(Soon to be uploaded)

## Folder Structure

backend/
controllers/
models/
routes/
middleware/

frontend/
src/
components/
pages/

## Installation

Clone the repository

```bash
git clone https://github.com/username/ripple.git
```

Install backend dependencies

```bash
cd backend
npm install
```

Install frontend dependencies

```bash
cd ../frontend
npm install
```

Create a `.env` file inside the backend.

```env
PORT=3001
MONGO_URI=your_mongodb_uri
JWT_SECRET_KEY=your_secret
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Create `frontend/.env.local` with the matching public provider configuration:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_PRIVACY_EMAIL=privacy@your_domain.com
```

Run backend

```bash
npm run dev
```

Run frontend

```bash
npm run dev
```

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---------|----------|-------------|
| POST | /signup | Register user |
| POST | /login | Login user |

### Profile

| Method | Endpoint |
|---------|----------|
| POST | /update_profile_picture |

## Future Improvements

- Like system
- Comments
- Follow users
- Notifications
- Real-time chat using Socket.IO
- Posts with images

## Author

Dipen Bhandari
