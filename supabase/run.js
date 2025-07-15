/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/*
1) connexion db
2) select all played migrations scripts
3) diff between played scripts and locals scripts
4) play scripts -> if errors rollback
*/

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const debug = require('debug')
const _ = require('lodash')
const { Client } = require('pg')
const argv = require('minimist')(process.argv.slice(2))

let scriptsPath = path.join(__dirname, 'db-migrations')

// Simple postgres connection
const postgres = new Client({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL
})

async function saveMigrationScript (scriptName) {
  if (scriptName === 'functions.sql' || scriptName === 'policies.sql') {
    return
  }
  const sqlQuery =
    'INSERT INTO supabase_migrations.migrations(script_name) VALUES($1) RETURNING id'
  debug('sqlQuery => ', sqlQuery, scriptName)
  await postgres.query(sqlQuery, [scriptName])
}

async function revertMigrationScript (scriptName) {
  const sqlQuery =
    'DELETE FROM supabase_migrations.migrations WHERE script_name = $1'
  debug('sqlQuery => ', sqlQuery, scriptName)
  await postgres.query(sqlQuery, [scriptName])
}

async function fetchMigrationScriptsAlreadyPlayed () {
  const rawPlayedMigrations = await postgres.query(
    'SELECT * from supabase_migrations.migrations ORDER BY script_name'
  )
  return rawPlayedMigrations.rows.map(raw => raw.script_name)
}

async function createMigrationDBIfNotExist () {
  try {
    const sqlQuery = `
    create schema if not exists supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.migrations (
    id  SERIAL PRIMARY KEY,
    script_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
    );
    `
    await postgres.query(sqlQuery).catch(console.log)
    console.log('[INFO]', 'created db')
  } catch (e) {
    console.log('table exists', e)
    throw e
  }
}

async function playMigrationScripts (migrationScriptNames, doNotSave = false) {
  const scriptsNames = Object.keys(migrationScriptNames)
  for (let i = 0; i < scriptsNames.length; i++) {
    const migrationScriptName = migrationScriptNames[i]
    const runMigrationScript = fs.readFileSync(
      path.join(scriptsPath, migrationScriptName),
      { encoding: 'utf8' }
    )
    console.log(`\nStarting migration: ${migrationScriptName}`)
    const noTransaction = argv.transaction === false || argv.transaction === 0
    try {
      if (!noTransaction) {
        await postgres.query('BEGIN')
      }
      const rows = await postgres.query(runMigrationScript)
      if (argv.debug) {
        console.log('\tResult', rows)
      }

      console.log(`\tEnd: migration has been played`)
      if (!noTransaction) {
        await postgres.query('COMMIT')
      }
      console.log('\tCOMMITTED', migrationScriptName)
      if (!doNotSave) {
        await saveMigrationScript(migrationScriptName)
      }
      console.log(`\tEnd: execution has been recorded in db`)
    } catch (err) {
      if (!noTransaction) {
        await postgres.query('ROLLBACK')
      }
      console.error(
        '\n\n',
        `${migrationScriptName} can't be played: `,
        err.message,
        err.line,
        err,
        '\n\n'
      )
      if (!noTransaction) {
        console.log('\tRolling back', migrationScriptName)
      }
      postgres.end()
      throw err
    }
  }
}

async function run () {
  try {
    const script = argv._[0]
    console.log(argv)
    if (argv.skip === true && !script) {
      throw new Error('error_missing_script_to_skip')
    }

    const mustCreate = argv.create || argv.c

    console.log('\n\n')
    console.log(
      '[INFO]',
      '💾 SUPABASE DB MIGRATIONS 💾',
      '\n _______________________________________________',
      '\n\n'
    )
    console.log('[INFO]', 'Starting migrations')
    if (argv.debug) {
      console.log('[INFO]', 'DEBUG MODE', process.env)
    }
    console.log('[INFO]', 'Starting migrations')

    await postgres.connect()
    console.log('[INFO]', 'CONNECTED TO', 'Database')

    if (argv.help || argv.h) {
      console.log('This is a simple migrations manager for the database')
      console.log('USAGE:')
      console.log('     npm run migration : run all the pending migrations.')
      console.log(
        '     npm run migration <migration name> : run the provided migration'
      )
      console.log(
        '     npm run migration <migration name> --skip  :  skips permanently the provider migration'
      )
      console.log(
        '     npm run migration <migration name> --revert  :  revert an already played migration'
      )
      console.log(
        '     npm run migration <migration name> --list  :  list all the migrations already played and the ones to play'
      )
      console.log(
        '     npm run migration <migration name> --create <name>  :  create a new migration file with the given name'
      )
      console.log(
        '     npm run migration <migration name> --create <name> --func  :  create a new function file with the given name'
      )
      console.log(
        '     npm run migration <migration name> --debug  :  run the migration in debug mode'
      )
      console.log(
        '     npm run migration <migration name> --policies  :  sync database policies'
      )
      console.log(
        '     npm run migration <migration name> --db  :  sync database policies, functions, triggers and cron'
      )

      console.log(
        '     npm run migrations <migration name> --no-transaction  :  run the migration without using transactions (useful if you get an error saying that an sql statement `cannot run inside a transaction block`'
      )
      process.exit(0)
    }

    if (mustCreate && !argv.func) {
      const now = new Date()
      const migrationName = `${now.toISOString().replace(/[T.:]/g, '_')}-${
        argv.create || argv.c
      }.sql`
      console.log('Destination', path.join(scriptsPath, migrationName))
      fs.writeFileSync(
        path.join(scriptsPath, migrationName),
        `
-- YOUR SQL QUERIES
ALTER TABLE XXX ADD COLUMN IF NOT EXISTS YYY TEXT default '';
COMMENT on column XXX.YYY is 'a comment';
      `
      )
      setTimeout(() => process.exit(0), 200)
      return
    }
    if (argv.c && argv.func) {
      const now = new Date()
      let functionName = argv.func
      if (functionName === true) {
        functionName = argv.c
      }
      // Convert function name to snake_case
      const snakeCaseFunctionName = (functionName || '')
        .replace(/([a-z])([A-Z])/g, '$1_$2') // Convert camelCase to snake_case
        .replace(/[\s-]+/g, '_') // Replace spaces and hyphens with underscores
        .toLowerCase() // Convert to lowercase

      console.log(
        `Converting function name to snake_case: ${functionName} → ${snakeCaseFunctionName}`
      )

      // Use the snake_case function name for the rest of the process
      const functionFileName = `${now
        .toISOString()
        .replace(/[T.:]/g, '_')}-${functionName}.sql`
      const functionFilePath = path.join(
        path.resolve(scriptsPath, '..'),
        'db-functions',
        functionFileName
      )

      console.log('Creating function template at', functionFilePath)

      fs.writeFileSync(
        functionFilePath,
        `
-- Function: ${functionName}
-- Description: Add your function description here

CREATE OR REPLACE FUNCTION ${snakeCaseFunctionName}(
  -- Add your parameters here
  -- param1 TEXT,
  -- param2 INTEGER
)
RETURNS TABLE (
  -- Define your return columns here
  -- column1 TEXT,
  -- column2 INTEGER
) AS $$
BEGIN
  -- Your function logic here

  -- Example:
  -- RETURN QUERY
  --   SELECT column1, column2
  --   FROM some_table
  --   WHERE condition;

END;
$$ LANGUAGE plpgsql;

-- Add comment to function
COMMENT ON FUNCTION ${functionName} IS 'Add your function description here';
      `
      )

      console.log(
        `Function template for "${functionName}" created successfully!`
      )
      setTimeout(() => process.exit(0), 200)
      return
    }
    if (argv.skip) {
      await saveMigrationScript(script || argv.skip)
      console.log('Skipped permanently', script)
      setTimeout(() => process.exit(0), 500)
      return
    }
    if (argv.policies || argv.db) {
      // update script path to point toward policies.sql folder
      scriptsPath = path.resolve(scriptsPath, '..')
      const functionsDirPath = path.resolve(scriptsPath, 'db-functions')
      const functions = fs.readdirSync(functionsDirPath)
      console.log('---------------------------------\n', functions)

      // call playMigrationScript function with policies.sql
      await playMigrationScripts(['functions.sql'], true)
      if (functions?.length) {
        await playMigrationScripts(
          functions.map(f => `/db-functions/${f}`),
          true
        )
      }
      await playMigrationScripts(['triggers.sql'], true)
      console.log('---------------------------------')
      await playMigrationScripts(['policies.sql'], true)
      console.log('---------------------------------')
      await playMigrationScripts(['cron.sql'], true)

      setTimeout(() => process.exit(0), 500)
      return
    }
    await createMigrationDBIfNotExist()
    const scriptsAlreadyPlayed = await fetchMigrationScriptsAlreadyPlayed()
    const scriptsInMigrationFolder = fs
      .readdirSync(scriptsPath)
      .sort()
      .filter(f => f.endsWith('.sql'))
    let scriptsToPlay = _.difference(
      scriptsInMigrationFolder,
      scriptsAlreadyPlayed
    )

    if (argv.list) {
      console.log('Scripts already played')
      console.table(scriptsAlreadyPlayed)
      console.log('Scripts to play')
      console.table(scriptsToPlay)
      process.exit(0)
      return
    }
    if (argv.revert) {
      await revertMigrationScript(argv.revert)
      console.log('Reverted migration', argv.revert)
      process.exit(0)
      return
    }
    if (script) {
      scriptsToPlay = [script]
    }
    console.log(
      `(${
        scriptsInMigrationFolder.length
      }) Migrations scripts : ${scriptsToPlay.join(
        '\n\n'
      )} \n\n will be played (${scriptsToPlay.length})`
    )
    if (process.env.DEBUG) {
      console.table(scriptsToPlay)
    }
    await playMigrationScripts(scriptsToPlay)
    console.log('\n _______________________________________________')
    postgres.end()
    setTimeout(() => process.exit(0), 500)
  } catch (err) {
    console.log('Migration error', err.message, err.name, err.line)
    postgres.end()
    process.exit(-1)
  }
}

run()
