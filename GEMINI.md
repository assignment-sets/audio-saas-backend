# Project Overview

This is the backend service for an audio SaaS application, developed using Node.js and TypeScript. It leverages the Express.js framework for API handling, Prisma as an ORM for database interactions with PostgreSQL, and integrates with Auth0 for authentication and OpenFGA for fine-grained authorization. For asynchronous tasks and background processing, it utilizes BullMQ. File storage is managed via AWS S3.

A separate `audio-processing-container` directory indicates a modular architecture, likely for handling audio-specific tasks as a dedicated service or worker.

## Key Technologies

*   **Language:** TypeScript, Node.js
*   **Web Framework:** Express.js
*   **Database:** PostgreSQL (managed by Prisma)
*   **ORM:** Prisma
*   **Authentication:** Auth0
*   **Authorization:** OpenFGA
*   **Queueing:** BullMQ
*   **Cloud Storage:** AWS S3

# Getting Started

## Prerequisites

*   Node.js (LTS version recommended)
*   Docker (for local PostgreSQL instance)

## Local Development Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd audio-sass-backend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start PostgreSQL with Docker:**
    The `README.md` provides an example Docker command for running the Postgres container:
    ```bash
    docker run -d 
    --name music-db 
    -e POSTGRES_USER=postgres 
    -e POSTGRES_PASSWORD=postgres 
    -e POSTGRES_DB=postgres 
    -p 5432:5432 
    -v pg_music_data:/var/lib/postgresql/data 
    38a11138d965 # This hash might be an image ID, replace with actual image name if needed, e.g., postgres:latest
    ```
    Alternatively, you can use the provided `docker-compose.yaml` to spin up services, including the database.

4.  **Run database migrations and generate Prisma client:**
    ```bash
    npm run migrate
    npm run gen
    ```

5.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application will typically run on `http://localhost:3000` (or as configured in environment variables).

## Building and Running for Production

1.  **Build the application:**
    ```bash
    npm run build
    ```

2.  **Start the compiled application:**
    ```bash
    npm start
    ```

# Development Conventions

*   **Code Formatting:** This project uses [Prettier](https://prettier.io/) for code formatting. Ensure your code is formatted by running:
    ```bash
    npm run format
    ```
*   **Commit Linting:** [Husky](https://typicode.github.io/husky/) and [Commitlint](https://commitlint.js.org/) are used to enforce conventional commit messages. This helps maintain a clear and consistent commit history. Refer to the `.husky/` directory and `commitlint.config.js` for configuration details.
*   **Type Checking:** The project is written in TypeScript, ensuring static type checking for code quality and maintainability.
*   **Environment Variables:** Environment variables are managed via `dotenv` and validated using `zod` (see `src/config/env_setup/`).

# Project Structure Highlights

*   `src/`: Contains the main application source code.
    *   `config/`: Configuration files (environment setup, logging).
    *   `lib/`: Reusable utility functions and client instances (Auth0, FGA, Prisma, S3, Queue).
    *   `middleware/`: Express middleware for authentication, error handling, and validation.
    *   `modules/`: Feature-specific modules (e.g., `artist`, `track`, `users`), each containing controllers, routes, schemas, and services.
    *   `queues/`: Defines queue types and worker implementations.
*   `prisma/`: Prisma schema and database migrations.
*   `audio-processing-container/`: Separate project likely for audio processing logic.
*   `docker-compose.yaml`: Docker Compose configuration for local services.
