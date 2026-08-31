# AlumniSync

Alumni data automation platform — extract alumni profiles from LinkedIn, validate eligibility, and manage records through a FastAPI backend, web dashboard, and browser extension.

## Features

- **Browser extension** — scrape LinkedIn profile data and sync to the API
- **FastAPI backend** — REST API with CSV import/export, search, and alumni eligibility checks
- **Web dashboard** — browse, search, and manage alumni records at `/dashboard`
- **Entity matching** — identity scoring and duplicate detection during ingestion

## Project structure

```
AlumniSync/
├── backend/          # FastAPI app, models, services, API routes
├── dashboard/        # Static web UI (served at /dashboard)
├── extension/        # Chrome extension (Manifest V3)
├── data/             # Sample CSV data for testing
├── scripts/          # Utility scripts
├── tests/            # pytest test suite
└── requirements.txt
```

## Prerequisites

- Python 3.10+
- Google Chrome (for the browser extension)
- Git

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/tanmay711/i2iaoc_alumnisync.git
cd i2iaoc_alumnisync
```

### 2. Create a virtual environment

**Windows (PowerShell):**

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

**macOS / Linux:**

```bash
python -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Start the backend

From the project root:

```bash
uvicorn backend.main:app --reload
```

The API starts at [http://localhost:8000](http://localhost:8000).

| URL | Description |
|-----|-------------|
| [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive API docs (Swagger) |
| [http://localhost:8000/dashboard](http://localhost:8000/dashboard) | Alumni dashboard |
| [http://localhost:8000/health](http://localhost:8000/health) | Health check |

The SQLite database (`alumnisync.db`) is created automatically on first startup.

## Browser extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `extension/` folder
4. Make sure the backend is running on port 8000
5. Navigate to a LinkedIn profile (`linkedin.com/in/...`) and open the AlumniSync popup to sync

## Running tests

```bash
pytest
```

Run a specific test file:

```bash
pytest tests/test_ingestion.py -v
```

## Contributing

1. Fork the repository on GitHub
2. Create a feature branch from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. Make your changes and ensure tests pass:

   ```bash
   pytest
   ```

4. Commit and push your branch:

   ```bash
   git add .
   git commit -m "Describe your change"
   git push origin feature/your-feature-name
   ```

5. Open a **Pull Request** against `main` on GitHub

### Guidelines

- Keep changes focused — one feature or fix per PR
- Match existing code style and project structure
- Add or update tests when changing backend logic
- Do not commit secrets, `.env` files, or local databases (see `.gitignore`)

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/alumni/` | List alumni (paginated, searchable) |
| `POST` | `/alumni/` | Create an alumni record |
| `GET` | `/alumni/{id}` | Get a single record |
| `PUT` | `/alumni/{id}` | Update a record |
| `DELETE` | `/alumni/{id}` | Delete a record |
| `GET` | `/alumni/export` | Export alumni as CSV |
| `POST` | `/alumni/import` | Import alumni from CSV |
| `POST` | `/alumni/ingest` | Ingest scraped LinkedIn profile data |

See [http://localhost:8000/docs](http://localhost:8000/docs) for full request/response schemas.

## License

TBD — confirm with the project maintainers before external use.
