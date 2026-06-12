# PCA Exam Review

A frontend-only React + TypeScript study app for the Google Cloud Professional
Cloud Architect exam, built from local `exams/pca` source.

- 277 questions (general GCP architecture + the JencoMart, Helicopter Racing
  League, EHR Healthcare, Mountkirk Games, TerramEarth, and Dress4Win case
  studies), parsed from the source PDFs into [src/data/questions.json](src/data/questions.json).
- Every option has an AI-written explanation of why it's correct or incorrect.
- No backend, no timer, no submit-to-server — all progress is saved in the
  browser's `localStorage` (key `pca-exam-review-progress-v1`).

## Features

- **Side panel** lists every question grouped by topic/case study, with a
  status dot (unanswered / correct / wrong).
- **Main panel** shows one question at a time with single- or multi-select
  options (multi-select questions show a "Choose N" hint).
- **Submit** anytime to grade the current question against the answer key —
  marks it Correct or Wrong and reveals an explanation for every option.
- **Filters**: All, Unanswered, Correct, Wrong.
- **Review Wrong Answers** mode: shows only wrong questions, read-only, with
  your answer, the correct answer, and the full per-option explanation.
- **Reset Progress** clears all saved answers/results.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in your browser.

## Build

```bash
npm run build
```
