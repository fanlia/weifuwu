import { type Orm, type Infer, type BodyOf } from '../../index.ts'
import { tables } from './src/db/orm.ts'
declare const orm: Orm
const T = tables(orm)
type B = BodyOf<typeof (T.agents extends never ? never : typeof SHAPES_agents_type)>
