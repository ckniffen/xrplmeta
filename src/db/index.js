import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { open as openStructDB } from '@structdb/sqlite'
import codecs from './codecs/index.js'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


export function open({ ctx }){
	let db = openStructDB({
		file: `${ctx.config.data.dir}/store.db`,
		schema: JSON.parse(
			fs.readFileSync(
				path.join(__dirname, 'schema.json')
			)
		),
		journalMode: 'WAL',
		debug: ctx.config.debug?.queries,
		codecs
	})

	db.tokens.createOne({
		data: {
			currency: 'XRP'
		}
	})

	return db
}