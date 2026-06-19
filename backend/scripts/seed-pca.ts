import { seedBuiltinDeck } from "../src/seed";

// Seeds the original 277-question PCA deck as a read-only deck shared with all
// users. Idempotent: re-running overwrites the same fixed-id deck.
//
// Local:      npm run seed         (reads .env.local -> Firestore emulator)
// Production: run with prod env / ADC against the real Firestore.

seedBuiltinDeck()
  .then((count) => {
    console.log(`Seeded "PCA Exam Review (built-in)" (${count} questions) as a shared deck.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
