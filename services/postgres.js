const pg = require('pg')

// todo verify if we don't use weird numerics somewhere
const types = pg.types
types.setTypeParser(1700, 'text', parseFloat)
let pgDb = global.postgres

async function initConnection (appName = process.env.APP_NAME || 'front') {
  // console.log('OPENING CONNEXION');
  const config = {
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DB,
    application_name: process.env.POSTGRES_APP_NAME || appName
  }

  try {
    console.log('CONNECTING TO DATABASE')
    if (!process.env.POSTGRES_URL) {
      console.table({ ...config, password: '******' })
    } else {
      console.log(process.env.POSTGRES_URL.split('@')?.[1])
    }
    pgDb = process.env.POSTGRES_URL
      ? new pg.Client(process.env.POSTGRES_URL)
      : new pg.Pool(config)
    await pgDb.connect()
  } catch (err) {
    console.error(
      '[SERVICE POSTGRES] ☠ Error while connecting to database',
      config.database,
      err.message
    )
    process.exit()
  }

  // console.info(`connected to DB HOST: ${config.host} Database: ${config.database}`);

  await pgDb.query("SET search_path TO 'public';")

  // pgDb.query('show search_path;', (err, data) => {
  //   console.info('Current schema is ', data.rows && data.rows[0]);
  // });

  if (process.env.DEBUG_SQL) {
    pgDb.on('query', sql => {
      console.log('[debug sql]', sql)
    })
  }
  global.postgres = pgDb
}

if (!pgDb) {
  initConnection()
}

module.exports = pgDb
