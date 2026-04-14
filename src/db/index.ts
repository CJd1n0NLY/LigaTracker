import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'

import { schema } from './schema'
import Team from './models/Team'
import Player from './models/Player'
import Game from './models/Game'
import GameEvent from './models/GameEvent'

// 1. Set up the SQLite Adapter
const adapter = new SQLiteAdapter({
  schema,
  // (You can add migrations here later if you change your tables)
  jsi: true, /* JSI is a massive performance boost for React Native */
  onSetUpError: error => {
    console.error("Database failed to load:", error)
  }
})

// 2. Initialize the Database
export const database = new Database({
  adapter,
  modelClasses: [
    Team,
    Player,
    Game,
    GameEvent,
  ],
})