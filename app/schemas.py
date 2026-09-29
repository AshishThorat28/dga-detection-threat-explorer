from pydantic import BaseModel, Field

class DomainRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=1000)

class BatchRequest(BaseModel):
    domains: list[str] = Field(min_length=1, max_length=500)

class GenerateRequest(BaseModel):
    algorithm: str = Field(default="lcg")
    seed: int = Field(default=42, ge=0)
    date: str = Field(default="2026-01-01", min_length=8, max_length=20)
    count: int = Field(default=20, ge=1, le=500)
