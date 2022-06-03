import log from '@mwni/log'
import { div, max, min, sum, floor } from "@xrplkit/xfl"


export async function extract({ ledger, meta }){
	if(ledger.transactions.length === 0)
		return

	let types = {}
	let fees = []

	for(let transaction of ledger.transactions){
		if(!types[transaction.TransactionType])
			types[transaction.TransactionType] = 0
		
		types[transaction.TransactionType]++
		fees.push(transaction.Fee)
	}

	await meta.ledgers.createOne({
		data: {
			index: ledger.index,
			hash: ledger.hash,
			closeTime: ledger.closeTime,
			txCount: ledger.transactions.length,
			txTypeCounts: Object.entries(types)
				.map(([type, count]) => ({ type, count })),
			minFee: min(...fees),
			maxFee: max(...fees),
			avgFee: floor(
				div(
					fees.reduce((total, fee) => sum(total, fee), '0'),
					fees.length
				)
			)
		}
	})

	log.accumulate.info({
		line: [`recorded %ledgers ledgers in %time`],
		ledgers: 1
	})
}