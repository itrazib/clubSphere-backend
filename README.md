# ClubSphere – Backend (Server)

## 🧠 Project Overview

ClubSphere Backend is the server-side API for the ClubSphere platform. It handles authentication, role-based authorization, club and event management, memberships, event registrations, and Stripe payment processing using secure RESTful APIs.

---

## 🌐 Live API

https://club-sphere-full-stack-frontend.vercel.app/

---

## ✨ Key Features

* RESTful API built with Express
* Firebase token verification middleware
* Role-based access control (Admin, Club Manager, Member)
* Club, Event, Membership & Registration CRUD
* Stripe payment integration (test mode)
* Secure JWT-based authorization
* MongoDB relational data design

---

## 🛠 Tech Stack

* Node.js
* Express.js
* MongoDB
* Firebase Admin SDK
* Stripe
* JSON Web Token (JWT)
* CORS
* Dotenv

---

## 📁 Folder Structure (Simplified)

```
server/
 ┣ routes/
 ┣ controllers/
 ┣ middlewares/
 ┣ utils/
 ┣ index.js
 ┗ config.js
```

---

## 📦 MongoDB Collections

* users
* clubs
* memberships
* events
* eventRegistrations
* payments

---

## 🔐 Environment Variables

Create a `.env` file in the server root:

```
PORT=5000
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret_key
FB_SERVICE_KEY=base64_encoded_firebase_admin_sdk
```

---

## ▶️ Run Locally

```
npm install
nodemon index.js
```

---

## 🔒 Security Notes

* All sensitive routes are protected with Firebase token verification
* Admin-only and Manager-only routes are role-checked
* Environment variables are never exposed

---

## 📦 Important NPM Packages

* express
* mongodb
* firebase-admin
* stripe
* jsonwebtoken
* cors
* dotenv

---

## 📄 Notes

* Ensure CORS is configured for deployed client domain
* Stripe runs in test mode only
