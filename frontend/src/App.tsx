import { useState } from 'react';
import './App.css';
import { DecksScreen } from './components/DecksScreen';
import { StudyScreen } from './components/StudyScreen';

function App() {
  const [deckId, setDeckId] = useState<string | null>(null);

  if (deckId) {
    return <StudyScreen deckId={deckId} onBack={() => setDeckId(null)} />;
  }
  return <DecksScreen onOpen={setDeckId} />;
}

export default App;
