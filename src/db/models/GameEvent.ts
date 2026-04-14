import { Model } from '@nozbe/watermelondb'
import { field } from '@nozbe/watermelondb/decorators'

export default class GameEvent extends Model {
  static table = 'game_events'

  @field('game_id') gameId!: string
  @field('player_id') playerId!: string
  @field('team_id') teamId!: string
  @field('event_type') eventType!: string
  @field('value') value!: number
  @field('timestamp_ms') timestampMs!: number
}