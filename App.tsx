import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Q } from '@nozbe/watermelondb';

import { database } from './src/db';
import Game from './src/db/models/Game';
import AdminDashboard from './src/screens/AdminDashboard';
import PreGameSetup from './src/screens/PreGameSetup';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'setup' | 'game'>('setup');
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    // Lock orientation
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
    }
    lockOrientation();

    // On startup, check if there's an unfinished game in the DB.
    // If yes, resume it. If not, stay on setup screen.
    async function checkForOngoingGame() {
      try {
        const ongoingGames = await database
          .get<Game>('games')
          .query(Q.where('status', 'ongoing'))
          .fetch();

        if (ongoingGames.length > 0) {
          // Resume the most recently created ongoing game
          const latest = ongoingGames[ongoingGames.length - 1];
          setActiveGameId(latest.id);
          setCurrentScreen('game');
        }
        // else: no ongoing game → stay on setup (default state)
      } catch (error) {
        // DB not ready yet or no games exist — just stay on setup
        console.log('No ongoing game found, starting fresh.');
      }
    }
    checkForOngoingGame();
  }, []);

  const handleStartGame = (gameId: string) => {
    setActiveGameId(gameId);
    setCurrentScreen('game');
  };

  const handleEndGame = () => {
    setActiveGameId(null);
    setCurrentScreen('setup');
  };

  // Safety guard: never render AdminDashboard without a valid gameId
  const showGame = currentScreen === 'game' && activeGameId !== null;

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {showGame ? (
        <AdminDashboard gameId={activeGameId} onEndGame={handleEndGame} />
      ) : (
        <PreGameSetup onStartGame={handleStartGame} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
});