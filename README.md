# AI Model Inventory Manager Server

## Live Server
https://ai-model-server-xi.vercel.app/

## Project Overview
This is the backend server for AI Model Inventory Manager. It provides RESTful APIs for managing AI model data, user-created models, purchased models, search, filter, and purchase count updates.

## Features
- RESTful API for AI model CRUD operations.
- MongoDB database integration.
- Add, update, delete, and fetch AI models.
- Search models by name using MongoDB `$regex`.
- Filter models by framework.
- Store purchased model data in a separate collection.
- Increment purchase count using MongoDB `$inc`.
- Environment variables used to protect sensitive credentials.
- CORS enabled for client-server communication.

## Technologies Used
- Node.js
- Express.js
- MongoDB
- dotenv
- cors
- Vercel
