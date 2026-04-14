import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

export default class Game extends Model {
  static table = 'games'

  @field('team_a_id') teamAId!: string
  @field('team_b_id') teamBId!: string
  @field('status') status!: string // 'scheduled', 'ongoing', 'finished'
  @field('winner_id') winnerId?: string
  @readonly @date('created_at') createdAt!: number
}