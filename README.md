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

## Android app

The app is wrapped as a native Android app with [Capacitor](https://capacitorjs.com)
(config in [capacitor.config.ts](capacitor.config.ts), native project in
[android/](android/)). Progress on Android is saved via the WebView's
`localStorage` (the `/api/progress` file persistence only applies to the
dev/preview server).

**CI builds:** every push to `main` (or a manual "Run workflow" trigger) runs
[.github/workflows/android-build.yml](.github/workflows/android-build.yml),
which builds the APK on GitHub's runners and publishes it to the rolling
**`latest` release** — grab `pca-exam-review.apk` from the repo's Releases
page anytime. The APK is also attached to each run as the
`pca-exam-review-debug-apk` artifact (expires after 90 days). No local
toolchain needed.

To rebuild the APK locally instead:

```bash
npm run android:build
```

This produces `android/app/build/outputs/apk/debug/app-debug.apk`, which can
be sideloaded directly onto a device (enable "Install unknown apps" on the
phone). Requires JDK 21 and an Android SDK — either via Android Studio, or
set `JAVA_HOME` and `ANDROID_HOME` to standalone installs.

The debug APK is fine for personal use. For Play Store distribution you'd
need a signed release build (`./gradlew bundleRelease` with a signing key).
