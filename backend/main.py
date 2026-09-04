from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from .database import Base, engine, ensure_schema
from .models import Alumni
from .api.alumni import router as alumni_router

# Auto-create all database tables on startup
Base.metadata.create_all(bind=engine)
ensure_schema()

app = FastAPI(
    title="AlumniSync API",
    version="1.0.0",
    description=(
        "Alumni Data Automation Platform — "
        "extract, validate, and manage alumni profiles from LinkedIn."
    )
)

# ---------------------------------------------------------------------------
# CORS — allow the browser extension and local dashboard to call the API
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # In production, restrict to your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(alumni_router)

# ---------------------------------------------------------------------------
# Serve the dashboard as static files (optional convenience)
# ---------------------------------------------------------------------------

dashboard_path = os.path.join(os.path.dirname(__file__), "..", "dashboard")
if os.path.isdir(dashboard_path):
    app.mount(
        "/dashboard",
        StaticFiles(directory=dashboard_path, html=True),
        name="dashboard"
    )

# ---------------------------------------------------------------------------
# Root endpoints
# ---------------------------------------------------------------------------


@app.get("/", tags=["Health"])
def root():
    return {
        "message": "AlumniSync API is running",
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}