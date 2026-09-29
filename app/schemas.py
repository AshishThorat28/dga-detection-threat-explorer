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

class UnseenExperimentRequest(BaseModel):
    train_families: list[str] | None = None
    unseen_families: list[str] | None = None
    per_family: int = Field(default=120, ge=20, le=1000)

class AdversarialRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=1000)
    length: int = Field(default=16, ge=1, le=63)
    randomness: float = Field(default=0.65, ge=0, le=1)
    digit_ratio: float = Field(default=0.15, ge=0, le=1)
    vowel_ratio: float = Field(default=0.3, ge=0, le=1)
    meaningful_word: str = Field(default="", max_length=32)
    seed: int = Field(default=42, ge=0)

class SimulationRequest(BaseModel):
    algorithm: str = Field(default="lcg")
    seed: int = Field(default=42, ge=0)
    date: str = Field(default="2026-01-01", min_length=8, max_length=20)
    count: int = Field(default=20, ge=1, le=200)
    benign_count: int = Field(default=20, ge=1, le=200)
