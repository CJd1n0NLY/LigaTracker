import { Model } from '@nozbe/watermelondb'
import { field, date, readonly, children } from '@nozbe/watermelondb/decorators'

export default class Team extends Model {
  static table = 'teams'

  @field('name') name!: string
  @field('is_eliminated') isEliminated!: boolean
  @readonly @date('created_at') createdAt!: number
}