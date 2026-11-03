from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings

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


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = str(uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request payload is invalid.",
                "details": exc.errors(),
            }
        },
    )


@app.get("/healthz", tags=["system"])
async def healthz():
    return {"status": "ok", "service": settings.service_name, "api_version": settings.api_version}


@app.get("/api/v1/healthz", tags=["system"], include_in_schema=False)
async def versioned_healthz():
    return await healthz()
