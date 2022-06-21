import log from '@mwni/log'
import { spawn } from 'nanotasks'
import { create as createPool } from '../lib/xrpl/pool.js'
import { open as openDB } from '../../db/index.js'
import { createSnapshot } from '../etl/snapshot.js'
import { startSync } from '../etl/sync.js'


export async function run({ config }){
	let ctx = { 
		xrpl: createPool(config.ledger.sources),
		config, 
		log,
	}
	
	await spawn(':runSnapshot', { ctx })
	
	await Promise.all([
		spawn(':runSync', { ctx }),
		spawn(':runBackfill', { ctx })
	])
}


export async function runSnapshot({ ctx }){
	if(ctx.log)
		log.pipe(ctx.log)

	await createSnapshot({
		ctx: {
			...ctx,
			db: openDB({ ctx })
		}
	})
}

export async function runSync({ ctx }){
	if(ctx.log)
		log.pipe(ctx.log)

	log.info('starting sync')

	await startSync({
		ctx: {
			...ctx,
			db: openDB({ ctx })
		}
	})
}

export async function runBackfill({ ctx }){
	if(ctx.log)
		log.pipe(ctx.log)

	
}