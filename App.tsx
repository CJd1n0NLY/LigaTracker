import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

import { database } from './src/db'; 
import AdminDashboard from './src/screens/AdminDashboard';
import PreGameSetup from './src/screens/PreGameSetup';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'setup' | 'game'>('setup');
  
  // NEW: State to hold the active Game ID from WatermelonDB
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  useEffect(() => {
    async function lockOrientation() {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
    }
    lockOrientation();
  }, []);

  const handleStartGame = (gameId: string) => {
    setActiveGameId(gameId); // Save the ID
    setCurrentScreen('game'); // Switch to the dashboard
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} /> 
      
      {currentScreen === 'setup' ? (
        <PreGameSetup onStartGame={handleStartGame} />
      ) : (
        // Pass the activeGameId into the dashboard so it knows what to load
        <AdminDashboard gameId={activeGameId} /> 
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
});