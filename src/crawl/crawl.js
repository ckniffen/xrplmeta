import log from '@mwni/log'
import { spawn } from 'multitasked'
import { open } from '../db/index.js'
import crawlers from './crawlers/index.js'


export async function startCrawlers({ ctx }){
	for(let { name } of crawlers){
		spawn(':spawnCrawler', { ctx, name })
	}
}

export async function spawnCrawler({ ctx, name }){
	let { start } = crawlers.find(crawler => crawler.name === name)
	let crashed = false

	log.pipe(ctx.log)

	ctx = {
		...ctx,
		db: open({ ctx })
	}

	start({ ctx })
		.catch(error => {
			log.warn(`skipping crawler [${name}]:`, error.message)
			crashed = true
		})

	await Promise.resolve()

	if(!crashed){
		log.info(`started crawler [${name}]`)
	}else{
		process.exit()
	}
}