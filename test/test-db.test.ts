import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createTestDb, withTestDb } from '../test-utils.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const describePg = DATABASE_URL ? describe : describe.skip

describePg('createTestDb', () => {
  it('creates and destroys an isolated schema', async () => {
    const db = await createTestDb({ url: DATABASE_URL })

    // Create a table in the isolated schema
    await db.sql`CREATE TABLE test_items (id SERIAL PRIMARY KEY, name TEXT)`
    await db.sql`INSERT INTO test_items (name) VALUES (${'hello'})`

    const rows = await db.sql`SELECT * FROM test_items`
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'hello')

    await db.destroy()

    // Verify the schema is gone
    const { default: postgres } = await import('postgres')
    const checkSql = postgres(DATABASE_URL!)
    const schemas = await checkSql`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name = ${db.schema}
    `
    assert.equal(schemas.length, 0)
    await checkSql.end()
  })

  it('uses custom schema name', async () => {
    const db = await createTestDb({ url: DATABASE_URL, schema: 'my_custom_schema' })
    assert.equal(db.schema, 'my_custom_schema')
    await db.sql`CREATE TABLE test (id SERIAL PRIMARY KEY)`
    await db.destroy()
  })

  it('throws without DATABASE_URL', async () => {
    const orig = process.env.DATABASE_URL
    const orig2 = process.env.TEST_DATABASE_URL
    delete process.env.DATABASE_URL
    delete process.env.TEST_DATABASE_URL
    await assert.rejects(() => createTestDb(), /DATABASE_URL/)
    if (orig) process.env.DATABASE_URL = orig
    if (orig2) process.env.TEST_DATABASE_URL = orig2
  })
})

describePg('withTestDb', () => {
  it('rolls back changes after callback', async () => {
    const db = await createTestDb({ url: DATABASE_URL })
    try {
      await db.sql`CREATE TABLE test_rollback (id SERIAL PRIMARY KEY, name TEXT)`

      await withTestDb(db.url, async (sql) => {
        await sql`INSERT INTO test_rollback (name) VALUES (${'should_rollback'})`
        const rows = await sql`SELECT * FROM test_rollback`
        assert.equal(rows.length, 1)
      })

      const rows = await db.sql`SELECT * FROM test_rollback`
      assert.equal(rows.length, 0)
    } catch (e) {
      console.error('rollback test error:', e)
      throw e
    } finally {
      await db.destroy()
    }
  })

  it('rolls back even on error', async () => {
    const db = await createTestDb({ url: DATABASE_URL })
    try {
      await db.sql`CREATE TABLE test_error (id SERIAL PRIMARY KEY, name TEXT)`
      await db.sql`INSERT INTO test_error (name) VALUES (${'initial'})`

      try {
        await withTestDb(db.url, async (sql) => {
          await sql`INSERT INTO test_error (name) VALUES (${'should_rollback'})`
          throw new Error('test error')
        })
      } catch {
        // Expected
      }

      const rows = await db.sql`SELECT * FROM test_error`
      assert.equal(rows.length, 1)
      assert.equal(rows[0].name, 'initial')
    } catch (e) {
      console.error('rollback error test error:', e)
      throw e
    } finally {
      await db.destroy()
    }
  })
})
