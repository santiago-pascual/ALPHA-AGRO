"""Small diagonal Gaussian HMM with filtering only (no smoothing API)."""

from __future__ import annotations

import numpy as np
from scipy.special import logsumexp
from sklearn.cluster import KMeans


class DiagonalGaussianHMM:
    """Deterministic EM fit for short monthly sequences and causal filtering."""

    def __init__(self, n_states: int = 2, *, random_state: int = 1729,
                 max_iter: int = 100, tol: float = 1e-5, variance_floor: float = 1e-4):
        if n_states not in (2, 3):
            raise ValueError("Only the prespecified 2- and 3-state candidates are supported.")
        self.n_states = n_states
        self.random_state = random_state
        self.max_iter = max_iter
        self.tol = tol
        self.variance_floor = variance_floor
        self.startprob_: np.ndarray | None = None
        self.transmat_: np.ndarray | None = None
        self.means_: np.ndarray | None = None
        self.covars_: np.ndarray | None = None
        self.log_likelihood_: float | None = None
        self.n_iter_: int = 0
        self.n_samples_: int = 0

    def _emissions(self, x: np.ndarray) -> np.ndarray:
        assert self.means_ is not None and self.covars_ is not None
        delta = x[:, None, :] - self.means_[None, :, :]
        return -0.5 * (np.log(2 * np.pi * self.covars_).sum(axis=1)[None, :]
                       + (delta * delta / self.covars_[None, :, :]).sum(axis=2))

    def _forward(self, x: np.ndarray, startprob: np.ndarray | None = None) -> tuple[np.ndarray, float]:
        assert self.startprob_ is not None and self.transmat_ is not None
        log_start = np.log(np.maximum(startprob if startprob is not None else self.startprob_, 1e-300))
        log_trans = np.log(np.maximum(self.transmat_, 1e-300))
        emission = self._emissions(x)
        alpha = np.empty_like(emission)
        alpha[0] = log_start + emission[0]
        for t in range(1, len(x)):
            alpha[t] = emission[t] + np.logaddexp.reduce(alpha[t - 1][:, None] + log_trans, axis=0)
        return alpha, float(logsumexp(alpha[-1]))

    def fit(self, X: np.ndarray, *, lengths: list[int] | None = None) -> "DiagonalGaussianHMM":
        x = np.asarray(X, dtype=float)
        if x.ndim != 2 or len(x) < max(12, self.n_states * 4) or not np.isfinite(x).all():
            raise ValueError("HMM training data must be finite 2D input with at least 12 rows.")
        sequence_lengths = lengths or [len(x)]
        if sum(sequence_lengths) != len(x) or min(sequence_lengths) < 1:
            raise ValueError("HMM sequence lengths must be positive and sum to the row count.")
        self.n_samples_ = len(x)
        labels = KMeans(n_clusters=self.n_states, random_state=self.random_state,
                        n_init=10).fit_predict(x)
        self.means_ = np.vstack([x[labels == k].mean(axis=0) if np.any(labels == k) else x[k]
                                 for k in range(self.n_states)])
        global_var = np.maximum(x.var(axis=0), self.variance_floor)
        self.covars_ = np.tile(global_var, (self.n_states, 1))
        self.startprob_ = np.full(self.n_states, 1 / self.n_states)
        self.transmat_ = np.full((self.n_states, self.n_states), 0.1 / max(1, self.n_states - 1))
        np.fill_diagonal(self.transmat_, 0.9)
        previous = -np.inf
        boundaries = np.cumsum([0, *sequence_lengths])
        for iteration in range(1, self.max_iter + 1):
            gamma_sum = np.zeros(self.n_states)
            weighted_sum = np.zeros_like(self.means_)
            weighted_sq = np.zeros_like(self.means_)
            transition_sum = np.zeros_like(self.transmat_)
            start_sum = np.zeros(self.n_states)
            likelihood = 0.0
            for left, right in zip(boundaries[:-1], boundaries[1:], strict=True):
                seq = x[left:right]
                emission = self._emissions(seq)
                alpha, ll = self._forward(seq)
                log_trans = np.log(np.maximum(self.transmat_, 1e-300))
                beta = np.zeros_like(emission)
                for t in range(len(seq) - 2, -1, -1):
                    beta[t] = np.logaddexp.reduce(log_trans + emission[t + 1][None, :] + beta[t + 1][None, :], axis=1)
                gamma = np.exp(alpha + beta - ll)
                gamma /= np.maximum(gamma.sum(axis=1, keepdims=True), 1e-300)
                start_sum += gamma[0]
                gamma_sum += gamma.sum(axis=0)
                weighted_sum += gamma.T @ seq
                weighted_sq += gamma.T @ (seq * seq)
                log_xi = (alpha[:-1, :, None] + log_trans + emission[1:, None, :]
                          + beta[1:, None, :])
                transition_sum += np.exp(log_xi - logsumexp(
                    log_xi, axis=(1, 2), keepdims=True)).sum(axis=0)
                likelihood += ll
            self.startprob_ = start_sum / start_sum.sum()
            self.transmat_ = transition_sum / np.maximum(transition_sum.sum(axis=1, keepdims=True), 1e-12)
            self.means_ = weighted_sum / np.maximum(gamma_sum[:, None], 1e-12)
            self.covars_ = np.maximum(weighted_sq / np.maximum(gamma_sum[:, None], 1e-12)
                                      - self.means_ * self.means_, self.variance_floor)
            self.n_iter_ = iteration
            if np.isfinite(previous) and abs(likelihood - previous) <= self.tol * (1 + abs(previous)):
                break
            previous = likelihood
        self.log_likelihood_ = sum(self._forward(x[left:right])[1]
                                   for left, right in zip(boundaries[:-1], boundaries[1:], strict=True))
        return self

    def filter(self, X: np.ndarray, *, initial_probability: np.ndarray | None = None) -> np.ndarray:
        """Return P(state_t | x_0..x_t); future observations are never read."""
        if any(value is None for value in (self.startprob_, self.transmat_, self.means_, self.covars_)):
            raise RuntimeError("Call fit before filter.")
        x = np.asarray(X, dtype=float)
        if x.ndim != 2 or x.shape[1] != self.means_.shape[1] or not np.isfinite(x).all():
            raise ValueError("Filtering input must be finite and match fitted feature count.")
        probability = np.asarray(initial_probability if initial_probability is not None else self.startprob_, float)
        if probability.shape != (self.n_states,) or (probability < 0).any() or probability.sum() <= 0:
            raise ValueError("Invalid initial state probability.")
        probability = probability / probability.sum()
        log_trans = np.log(np.maximum(self.transmat_, 1e-300))
        probabilities = []
        for emission in self._emissions(x):
            log_predicted = logsumexp(np.log(np.maximum(probability, 1e-300))[:, None] + log_trans, axis=0)
            log_probability = log_predicted + emission
            probability = np.exp(log_probability - logsumexp(log_probability))
            probabilities.append(probability.copy())
        return np.vstack(probabilities)

    @property
    def bic(self) -> float:
        if self.log_likelihood_ is None or self.means_ is None:
            raise RuntimeError("Fit the HMM before reading BIC.")
        n, dimensions = self.n_samples_, self.means_.shape[1]
        parameters = (self.n_states - 1) + self.n_states * (self.n_states - 1) \
            + 2 * self.n_states * dimensions
        return float(-2 * self.log_likelihood_ + parameters * np.log(max(2, n)))
