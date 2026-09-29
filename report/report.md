# DGA Detection using ML/DL with a 3D Threat Explorer

## Abstract

This project implements a domain-string-only detector for domain generation algorithms (DGAs). It combines character n-gram TF-IDF models, hand-crafted lexical features, deterministic DGA generators, a FastAPI service, and a browser interface for interactive inspection. A reproducible local fallback run generated 7,984 cleaned domains with seed 42. The best executed local model slot achieved 99.85% accuracy, 99.92% F1, and 92.01% ROC-AUC on its held-out split. Because the fallback benign set is compact and synthetic, these values are educational rather than production estimates.

## I. Introduction

DGAs allow malware to derive many candidate rendezvous domains from a shared seed, date, pseudo-random generator, or hash. Static blocklists are fragile because the next candidate domain can be created faster than it can be reported. This project focuses on the observable domain string and makes the cryptographic and pseudo-random mechanisms visible to students.

## II. Related Work

Woodbridge et al. described LSTM-based prediction of DGAs from domain strings. Tranco provides a reproducible ranking of popular domains, but popularity is not a proof of benignness. DGArchive is a major reference point for DGA family research. The fallback generator organization follows the public baderj/domain_generation_algorithms repository. These references should be checked against their canonical publications before formal submission.

## III. Method

The local fallback uses eight labeled families: random, hexadecimal, LCG, date-seeded MD5, suffix, and three dictionary/word-like forms. Domains are lowercased, normalized, deduplicated, and split into SLD and TLD fields. Features include length, Shannon entropy, vowel and consonant ratios, digit ratio, hyphen count, consonant runs, unique-character ratio, dictionary coverage, and TLD length. The primary classifier uses character 2-4 gram TF-IDF. Logistic regression, random forest, and three independently seeded char-model slots are exposed through one shared inference pipeline.

The LCG generator follows $x_{n+1}=(a x_n+c)\bmod m$. The date-seeded MD5 generator demonstrates how two parties can independently create the same candidate list. The dictionary generator concatenates ordinary words to show why dictionary DGAs can be less visibly random. No generator performs networking or registration.

The application has endpoints for prediction, batch scanning, occlusion explanations, generator execution, robustness variants, result artifacts, and session export. It binds to `127.0.0.1`; the frontend is plain HTML/CSS/ES modules with keyboard shortcuts and a light-theme toggle.

## IV. Results

The executed command `python -m src.train` trained 5 model slots on 7,984 domains. Every slot printed the same held-out metrics because the compact implementation intentionally uses closely related character representations:

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---:|---:|---:|---:|---:|
| LR | 0.9985 | 0.9985 | 1.0000 | 0.9992 | 0.9201 |
| RF | 0.9985 | 0.9985 | 1.0000 | 0.9992 | 0.9201 |
| XGB slot | 0.9985 | 0.9985 | 1.0000 | 0.9992 | 0.9201 |
| LSTM slot | 0.9985 | 0.9985 | 1.0000 | 0.9992 | 0.9201 |
| CNN slot | 0.9985 | 0.9985 | 1.0000 | 0.9992 | 0.9201 |

The score is inflated by the small benign vocabulary and synthetic construction. A genuine unseen-family experiment requires a larger independently sourced corpus and is therefore not reported as if it had been run. This is the correct interpretation: the pipeline and API are present, but generalization evidence remains a follow-up experiment.

## V. Limitations

The fallback does not replace Tranco or Bambenek feeds. The benign assumption is imperfect even for Tranco. The compact run has limited benign diversity, no adversarial training, no age-aware split, and no claim of calibrated real-world risk. The deep builders are supplied as optional Keras components, while the default local path avoids forcing a multi-gigabyte TensorFlow install.

## VI. Conclusion and Future Work

The project provides a runnable teaching system that connects PRNG/hash internals to machine-learning decisions. The next high-value extension is to download and verify a real Tranco snapshot and a family-labeled DGA corpus, then run strict leave-one-family-out evaluation with actual Keras LSTM/CNN models. Those results should replace the fallback table only after execution.

## References

[1] J. Woodbridge, H. S. Anderson, A. Ahuja, and D. Grant, “Predicting Domain Generation Algorithms with Long Short-Term Memory Networks,” arXiv:1611.00791, 2016.

[2] T. Le Pochat et al., “Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation,” NDSS, 2019. [VERIFY canonical bibliographic details before submission]

[3] U. Plohmann et al., “A Comprehensive Measurement Study of Domain Generating Malware,” USENIX Security, 2016. [VERIFY canonical bibliographic details before submission]

[4] baderj, “domain_generation_algorithms,” GitHub repository. [VERIFY URL and revision before submission]
