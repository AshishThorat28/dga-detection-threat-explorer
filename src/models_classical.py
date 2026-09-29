"""Classical model entry points; shared implementation lives in inference.InferenceEngine."""
from .inference import InferenceEngine

def train_classical(frame=None):
    return InferenceEngine(frame)
