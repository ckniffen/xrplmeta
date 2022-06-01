import log from '@mwni/log'
import { wait, unixNow } from '@xrplkit/time'
import { spawn } from 'nanotasks'
import { open as openSnapshotStore } from '../../store/snapshot.js'
import { isIncomplete } from '../../lib/snapshot/state.js'
import { addNativeEntry } from '../../lib/snapshot/native.js'


export async function spawnTask(ctx){
	if(ctx.log)
		log.pipe(ctx.log)

	let snapshot = await openSnapshotStore({ ...ctx, variant: 'live' })

	return {
		async run(){
			if(!await isIncomplete({ snapshot }))
				return

			try{
				await copyFromFeed({ 
					...ctx, 
					snapshot, 
					feed: await createFeed({ 
						...ctx, 
						snapshot 
					})
				})
			}catch(error){
				log.error(`fatal error while copying from ledger feed:`)
				log.error(error.stack)

				throw error.stack
			}
			
		},
		async terminate(){
			log.info(`rolling up snapshot datastore`)
			await snapshot.close()
		}
	}
}


async function createFeed({ config, snapshot, xrpl }){
	let state = await snapshot.journal.readOne({ last: true })
	let ledgerIndex
	let preferredNode
	let marker

	if(state?.snapshotMarker){
		ledgerIndex = state.ledgerIndex
		preferredNode = state.snapshotOrigin
		marker = state.snapshotMarker
		
		log.info(`resuming snapshot of ledger #${ledgerIndex}`)
	}else{
		let { result } = await xrpl.request({
			command: 'ledger', 
			ledger_index: 'validated'
		})

		ledgerIndex = parseInt(result.ledger.ledger_index)

		log.info(`creating snapshot of ledger #${ledgerIndex} - this may take a long time`)
	}

	return await spawn(
		'../../lib/xrpl/feed.js:create', 
		{ config, xrpl, ledgerIndex, preferredNode, marker }
	)
}


async function copyFromFeed({ config, snapshot, feed }){
	let state = await snapshot.journal.readOne({ last: true })

	if(!state){
		state = await snapshot.journal.createOne({
			data: {
				ledgerIndex: feed.ledgerIndex,
				creationTime: unixNow(),
				snapshotOrigin: feed.node
			}
		})
	}

	while(true){
		let chunk = await feed.next()
		
		if(!chunk)
			break
		
		await snapshot.tx(async () => {
			for(let entry of chunk.objects){
				try{
					await addNativeEntry({ snapshot, entry })
				}catch(error){
					log.error(`failed to add ${entry.LedgerEntryType} ledger object "${entry.index}":`)
					log.error(error.stack)
					throw error
				}
			}

			state = await snapshot.journal.createOne({
				data: {
					ledgerIndex: feed.ledgerIndex,
					snapshotMarker: chunk.marker,
					entriesCount: state.entriesCount + chunk.objects.length
				}
			})
		})
		
		log.accumulate.info({
			line: [
				`copied`,
				state.entriesCount, 
				`ledger objects (+%objects in %time)`
			],
			objects: chunk.objects.length
		})
	}

	log.flush()
	log.info(`ledger snapshot complete`)

	await snapshot.journal.createOne({
		data: {
			ledgerIndex: feed.ledgerIndex,
			completionTime: unixNow(),
			snapshotMarker: null
		}
	})
}