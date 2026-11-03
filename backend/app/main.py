from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth.routes import router as auth_router
from .bridge.routes import router as bridge_router
from .config import get_settings
from .providers.routes import router as providers_router
from .providers.gemini_routes import router as gemini_router
from .tenancy.routes import router as workspaces_router

settings = get_settings()
app = FastAPI(
    title="PIECS Gateway API",
    version=settings.api_version,
    description="Provider-neutral backend boundary for PIECS AI Workflow Engine.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)

app.include_router(auth_router)
app.include_router(workspaces_router)
app.include_router(providers_router)
app.include_router(gemini_router)
app.include_router(bridge_router)


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # Do not return Pydantic's raw "input" or "ctx" fields: they may contain secrets.
    details = [
        {
            "location": list(error.get("loc", ())),
            "message": error.get("msg", "Invalid value."),
            "type": error.get("type", "value_error"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        headers={"X-Request-ID": getattr(request.state, "request_id", str(uuid4()))},
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request payload is invalid.",
                "details": details,
            }
        },
    )


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    # Never serialize exception text or stack traces into public API responses.
    return JSONResponse(
        status_code=500,
        headers={"X-Request-ID": getattr(request.state, "request_id", str(uuid4()))},
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
            }
        },
    )


@app.get("/healthz", tags=["system"])
async def healthz():
    return {"status": "ok", "service": settings.service_name, "api_version": settings.api_version}


@app.get("/api/v1/healthz", tags=["system"], include_in_schema=False)
async def versioned_healthz():
    return await healthz()
