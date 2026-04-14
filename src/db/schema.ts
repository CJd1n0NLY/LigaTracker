import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 1,
  tables: [
    // 1. TEAMS TABLE
    tableSchema({
      name: 'teams',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'is_eliminated', type: 'boolean' }, // For your semi-finals MVP logic
        { name: 'created_at', type: 'number' },
      ],
    }),

    // 2. PLAYERS TABLE
    tableSchema({
      name: 'players',
      columns: [
        { name: 'team_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'jersey_number', type: 'string' },
        { name: 'is_active', type: 'boolean' }, // Is currently playing in the league
      ],
    }),

    // 3. GAMES TABLE
    tableSchema({
      name: 'games',
      columns: [
        { name: 'team_a_id', type: 'string', isIndexed: true },
        { name: 'team_b_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' }, // 'scheduled', 'ongoing', 'finished'
        { name: 'winner_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // 4. GAME EVENTS TABLE (The most important one for stats)
    tableSchema({
      name: 'game_events',
      columns: [
        { name: 'game_id', type: 'string', isIndexed: true },
        { name: 'player_id', type: 'string', isIndexed: true },
        { name: 'team_id', type: 'string', isIndexed: true },
        { name: 'event_type', type: 'string' }, // 'points', 'rebound', 'assist', 'foul', 'turnover', 'steal', 'block'
        { name: 'value', type: 'number' }, // e.g., 1, 2, or 3 for points. 1 for other stats.
        { name: 'timestamp_ms', type: 'number' }, // Exact time it happened
      ],
    }),
  ],
})