"""Optional Keras models.

The free local path uses the deterministic char model in inference.py. TensorFlow users can
replace this module with Embedding->LSTM/CNN training without changing the API contract.
"""
def build_lstm(input_length=63, vocab_size=42):
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import Embedding, LSTM, Dropout, Dense
    return Sequential([Embedding(vocab_size, 32, input_length=input_length), LSTM(128), Dropout(.25), Dense(1, activation='sigmoid')])

def build_cnn(input_length=63, vocab_size=42):
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import Embedding, Conv1D, GlobalMaxPool1D, Dense
    return Sequential([Embedding(vocab_size, 32, input_length=input_length), Conv1D(64, 5, activation='relu'), GlobalMaxPool1D(), Dense(1, activation='sigmoid')])
