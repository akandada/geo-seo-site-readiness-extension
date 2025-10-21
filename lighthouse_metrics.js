// Portions of this file are adapted from Google Lighthouse (https://github.com/GoogleChrome/lighthouse).
// Copyright 2016 Google Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//     http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const SQRT2 = Math.sqrt(2);
const Z_10 = -1.2815515655446004; // 10th percentile of the standard normal distribution.
const LOGIT_TARGET = Math.log((1 / 0.9) - 1); // logit for 90th percentile reference.

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / SQRT2));
}

function computeLogNormalScore(reference, value) {
  if (value == null) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (v <= 0) return 1;
  const median = Number(reference && reference.median);
  const p10 = Number(reference && reference.p10);
  if (!(median > 0) || !(p10 > 0)) return null;
  const mu = Math.log(median);
  const sigma = (Math.log(p10) - mu) / Z_10;
  if (!Number.isFinite(sigma) || sigma <= 0) return null;
  const standardized = (Math.log(v) - mu) / sigma;
  const percentile = normalCdf(standardized);
  const score = 1 - percentile;
  return clamp(score, 0, 1);
}

function computeLogisticScore(reference, value) {
  if (value == null) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const median = Number(reference && reference.median);
  const p10 = Number(reference && reference.p10);
  if (!Number.isFinite(median) || !Number.isFinite(p10) || median === p10) {
    return null;
  }
  const k = LOGIT_TARGET / (p10 - median);
  const score = 1 / (1 + Math.exp(k * (v - median)));
  return clamp(score, 0, 1);
}

function formatMilliseconds(value) {
  const v = Number(value);
  if (!(v >= 0)) return "—";
  if (v >= 1000) {
    return (Math.round((v / 1000) * 10) / 10) + " s";
  }
  return Math.round(v) + " ms";
}

function formatCls(value) {
  const v = Number(value);
  if (!(v >= 0)) return "—";
  return v.toFixed(3);
}

export const LIGHTHOUSE_WEB_VITALS = {
  lcp: {
    id: "lcp",
    label: "Largest Contentful Paint",
    scoring: "log-normal",
    reference: { p10: 1200, median: 4000 },
    weight: 25,
    formatter: formatMilliseconds
  },
  cls: {
    id: "cls",
    label: "Cumulative Layout Shift",
    scoring: "logistic",
    reference: { p10: 0.1, median: 0.25 },
    weight: 10,
    formatter: formatCls
  },
  inp: {
    id: "inp",
    label: "Interaction to Next Paint",
    scoring: "log-normal",
    reference: { p10: 200, median: 500 },
    weight: 15,
    formatter: formatMilliseconds
  }
};

export function scoreWebVitals(values) {
  const metrics = {};
  let weightedScore = 0;
  let weightTotal = 0;

  for (const key in LIGHTHOUSE_WEB_VITALS) {
    const config = LIGHTHOUSE_WEB_VITALS[key];
    const rawValue = values && values[key] != null ? Number(values[key]) : null;
    let scoreValue = null;
    if (rawValue != null && Number.isFinite(rawValue)) {
      if (config.scoring === "logistic") {
        scoreValue = computeLogisticScore(config.reference, rawValue);
      } else {
        scoreValue = computeLogNormalScore(config.reference, rawValue);
      }
    }

    if (scoreValue != null) {
      weightedScore += scoreValue * config.weight;
      weightTotal += config.weight;
    }

    metrics[key] = {
      id: key,
      label: config.label,
      value: rawValue,
      displayValue: config.formatter(rawValue),
      score: scoreValue != null ? Math.round(scoreValue * 100) : null,
      scoreValue: scoreValue != null ? Number(scoreValue.toFixed(4)) : null,
      weight: config.weight,
      scoring: config.scoring,
      reference: config.reference
    };
  }

  const overallScoreValue = weightTotal ? weightedScore / weightTotal : null;
  return {
    source: "Lighthouse Core Web Vitals scoring (v11)",
    overallScore: overallScoreValue != null ? Math.round(overallScoreValue * 100) : null,
    overallScoreValue: overallScoreValue != null ? Number(overallScoreValue.toFixed(4)) : null,
    weightTotal,
    metrics
  };
}

export function scoreLabelFromValue(scoreValue) {
  if (scoreValue == null) return "—";
  if (scoreValue >= 0.9) return "good";
  if (scoreValue >= 0.5) return "needs-improvement";
  return "poor";
}
