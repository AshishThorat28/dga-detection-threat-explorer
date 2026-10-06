"""Character-sequence classifiers used by the optional deep training path."""
from __future__ import annotations

from typing import Any

import numpy as np

from .data import normalize_domain, split_domain

MAX_LENGTH = 63
CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789-."
CHAR_TO_ID = {character: index + 2 for index, character in enumerate(CHARACTERS)}
VOCAB_SIZE = len(CHAR_TO_ID) + 2


def encode_domains(domains: list[str]) -> np.ndarray:
    encoded = np.zeros((len(domains), MAX_LENGTH), dtype=np.int32)
    for row, domain in enumerate(domains):
        label = split_domain(normalize_domain(str(domain)))[0][:MAX_LENGTH]
        for column, character in enumerate(label):
            encoded[row, column] = CHAR_TO_ID.get(character, 1)
    return encoded


class CharacterSequenceClassifier:
    """Small predict_proba adapter around a trained Keras sequence model."""

    def __init__(self, model: Any):
        self.model = model

    def predict_proba(self, domains: list[str]) -> np.ndarray:
        scores = np.asarray(
            self.model.predict(encode_domains(domains), verbose=0),
            dtype=np.float64,
        ).reshape(-1)
        return np.column_stack((1.0 - scores, scores))

    def predict(self, domains: list[str]) -> np.ndarray:
        return (self.predict_proba(domains)[:, 1] >= 0.5).astype(np.int8)


def build_lstm(input_length: int = MAX_LENGTH, vocab_size: int = VOCAB_SIZE):
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import Dense, Dropout, Embedding, Input, LSTM

    model = Sequential([
        Input(shape=(input_length,), dtype="int32"),
        Embedding(vocab_size, 32, mask_zero=True),
        LSTM(64),
        Dropout(0.25),
        Dense(1, activation="sigmoid"),
    ], name="character_lstm")
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    return model


def build_cnn(input_length: int = MAX_LENGTH, vocab_size: int = VOCAB_SIZE):
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import (
        Conv1D, Dense, Dropout, Embedding, GlobalMaxPool1D, Input,
    )

    model = Sequential([
        Input(shape=(input_length,), dtype="int32"),
        Embedding(vocab_size, 32, mask_zero=False),
        Conv1D(64, 5, activation="relu", padding="same"),
        GlobalMaxPool1D(),
        Dropout(0.25),
        Dense(1, activation="sigmoid"),
    ], name="character_cnn")
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
    return model


def train_character_models(
    train_domains: list[str],
    train_labels: np.ndarray,
    validation_domains: list[str],
    validation_labels: np.ndarray,
    epochs: int = 5,
    batch_size: int = 256,
    seed: int = 42,
) -> dict[str, CharacterSequenceClassifier]:
    import tensorflow as tf

    if epochs < 1 or batch_size < 1:
        raise ValueError("epochs and batch_size must be positive")
    tf.keras.utils.set_random_seed(seed)
    train_x = encode_domains(train_domains)
    validation_x = encode_domains(validation_domains)
    classifiers = {}
    for name, builder in (("LSTM", build_lstm), ("CNN", build_cnn)):
        model = builder()
        model.fit(
            train_x, train_labels,
            validation_data=(validation_x, validation_labels),
            epochs=epochs, batch_size=batch_size, verbose=0,
        )
        classifiers[name] = CharacterSequenceClassifier(model)
    return classifiers
