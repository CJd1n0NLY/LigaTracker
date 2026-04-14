import { Model, Relation } from '@nozbe/watermelondb'
import { field, relation } from '@nozbe/watermelondb/decorators'

export default class Player extends Model {
  static table = 'players'

  @field('name') name!: string
  @field('jersey_number') jerseyNumber!: string
  @field('is_active') isActive!: boolean

  // This links the player directly to their team
  @relation('teams', 'team_id') team!: Relation<any>
}