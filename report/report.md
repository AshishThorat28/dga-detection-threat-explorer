# DGA Detection using ML/DL with a 3D Threat Explorer

## Abstract

This project implements a domain-string-only detector for domain generation algorithms (DGAs). It combines character n-gram TF-IDF models, hand-crafted lexical features, deterministic DGA generators, a FastAPI service, and a browser interface for interactive inspection. The local fallback creates 7,984 cleaned domains, but only 12 are unique benign domains. Its stratified random holdout therefore contains only 3 benign examples, making conventional scores unstable and unsuitable as performance evidence.

## I. Introduction

DGAs allow malware to derive many candidate rendezvous domains from a shared seed, date, pseudo-random generator, or hash. Static blocklists are fragile because the next candidate domain can be created faster than it can be reported. This project focuses on the observable domain string and makes the cryptographic and pseudo-random mechanisms visible to students.

## II. Related Work

Woodbridge et al. described LSTM-based prediction of DGAs from domain strings. Tranco provides a reproducible ranking of popular domains, but popularity is not a proof of benignness. DGArchive is a major reference point for DGA family research. The fallback generator organization follows the public baderj/domain_generation_algorithms repository. These references should be checked against their canonical publications before formal submission.

## III. Method

The no-argument fallback uses eight synthetic DGA-like families. The optional real-data training path reads `domain,class` rows from the family-labeled dataset and can add presumed-benign domains from a Tranco `rank,domain` list. Domains are normalized, cross-label registrable-label collisions are excluded, and each remaining registrable label is held to one split; DGA labels shared by multiple source families are marked `ambiguous`. The feature vectorizer is fit on training data only. The model suite includes logistic regression and random forest on character n-gram TF-IDF plus lexical features, XGBoost on the same feature matrix, and character-embedding LSTM and 1D-CNN models. The two Keras models are trained on fixed-length character sequences.

The LCG generator follows $x_{n+1}=(a x_n+c)\bmod m$. The date-seeded MD5 generator demonstrates how two parties can independently create the same candidate list. The dictionary generator concatenates ordinary words to show why dictionary DGAs can be less visibly random. No generator performs networking or registration.

The application has endpoints for prediction, batch scanning, occlusion explanations, generator execution, robustness variants, result artifacts, and session export. It binds to `127.0.0.1`; the frontend is plain HTML/CSS/ES modules with keyboard shortcuts and a light-theme toggle.

## IV. Results

The current `results/metrics.csv` reports a real-data random holdout after deduplication and a 20,000-per-class sampling cap. The fitted frame contains 38,500 domains: 20,000 presumed-benign rows, 18,500 DGA rows across eight families, with 9,625 held out (5,000 benign and 4,625 DGA). The metrics are not family-disjoint and should not be read as unseen-family performance.

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---:|---:|---:|---:|---:|
| LR | 0.9346 | 0.9426 | 0.9200 | 0.9312 | 0.9815 |
| RF | 0.8974 | 0.9288 | 0.8517 | 0.8886 | 0.9656 |
| XGB | 0.9471 | 0.9537 | 0.9354 | 0.9444 | 0.9872 |
| LSTM | 0.8801 | 0.9026 | 0.8413 | 0.8709 | 0.9489 |
| CNN | 0.8619 | 0.8700 | 0.8378 | 0.8536 | 0.9365 |

The family-held-out CSV is empty because real-data training does not yet run a family-disjoint evaluation. The previous synthetic experiment used only six benign controls against about 100 DGA samples per scenario; those scores were not real-corpus results and have been removed from that output.

## V. Limitations

The Tranco popularity ranking does not prove that a domain is benign, and the family-labeled repository data may be dated. Its stated GPL-2.0 license should be reviewed before redistribution. The fallback has only 12 unique benign domains; the external-data path uses a random rather than age-aware or family-disjoint holdout. Neither path includes adversarial training or probability calibration, and neither supports production-risk claims. XGBoost and TensorFlow remain optional dependencies.

## VI. Conclusion and Future Work

The project provides a runnable teaching system that connects PRNG/hash internals to machine-learning decisions and can train real XGBoost, character-level LSTM, and 1D-CNN classifiers alongside the random forest. The next high-value extension is strict time-aware and leave-one-family-out evaluation; the random-holdout metrics alone are not evidence of unseen-family generalization.

## References

[1] J. Woodbridge, H. S. Anderson, A. Ahuja, and D. Grant, “Predicting Domain Generation Algorithms with Long Short-Term Memory Networks,” arXiv:1611.00791, 2016.

[2] T. Le Pochat et al., “Tranco: A Research-Oriented Top Sites Ranking Hardened Against Manipulation,” NDSS, 2019. [VERIFY canonical bibliographic details before submission]

[3] U. Plohmann et al., “A Comprehensive Measurement Study of Domain Generating Malware,” USENIX Security, 2016. [VERIFY canonical bibliographic details before submission]

[4] baderj, “domain_generation_algorithms,” GitHub repository. [VERIFY URL and revision before submission]
