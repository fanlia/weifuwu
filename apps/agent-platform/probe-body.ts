import { type Orm, type Infer, type BodyOf } from 'weifuwu'
import { tables } from './src/db/orm'
declare const orm: Orm
const T = tables(orm)
type B = BodyOf<typeof (T.agents extends never ? never : typeof SHAPES_agents_type)>
