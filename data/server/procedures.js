import { unixNow } from '../../common/time.js'
import { currencyHexToUTF8, currencyUTF8ToHex } from '../../common/xrpl.js'
import { keySort, decimalCompare } from '../../common/data.js'
import Decimal from '../../common/decimal.js'

const candlestickIntervals = {
	'5m': 60 * 5,
	'15m': 60 * 15,
	'1h': 60 * 60,
	'4h': 60 * 60 * 4,
	'1d': 60 * 60 * 24,
}


export async function currencies(ctx){
	let limit = ctx.parameters.limit || 100
	let offset = ctx.parameters.offset || 0
	let minTrustlines = ctx.parameters.min_trustlines || 100
	let search = ctx.parameters.search
	let trustlines = await ctx.datasets.trustlines.get()
	let stacks = []
	let total = 0
	let now = unixNow()

	for(let trustline of trustlines){
		let enriched = await enrichTrustline(ctx, trustline)
		let formatted = formatTrustline(ctx, enriched, true)
		let stack = stacks.find(stack => stack.currency === formatted.currency)

		if(!stack){
			stack = {
				currency: formatted.currency,
				trustlines: [],
				stats: {
					volume: new Decimal(0),
					marketcap: new Decimal(0),
					liquidity: new Decimal(0),
				}
			}

			stacks.push(stack)
		}

		stack.trustlines.push(formatted)

		stack.stats.volume = stack.stats.volume.plus(enriched.stats.volume || 0)
		stack.stats.marketcap = stack.stats.marketcap.plus(enriched.stats.marketcap || 0)
		stack.stats.liquidity = stack.stats.liquidity.plus(enriched.stats.liquidity || 0)
	}

	stacks = keySort(
		stacks, 
		stack => stack.stats.volume || new Decimal(0), 
		decimalCompare
	)
		.reverse()

	for(let stack of stacks){
		stack.count = stack.trustlines.length
		stack.trustlines = keySort(
			stack.trustlines,
			trustline => Decimal.sum(
				trustline.stats.volume || 0, 
				(trustline.stats.trustlines || 0) / 1000
			), 
			decimalCompare
		)
			.reverse()
			.filter((trustline, i) => i < 3 || trustline.stats.trustlines >= minTrustlines)
	}

	if(search){
		stacks = stacks.filter(stack => {
			if(stack.currency.toLowerCase().startsWith(search.toLowerCase()))
				return true
		})
	}

	total = stacks.length

	if(limit)
		stacks = stacks.slice(offset, offset + limit)


	return {currencies: stacks, count: total}
}

export async function currency_stats(ctx){
	let currency = currencyUTF8ToHex(ctx.parameters.currency)
	let trustlines = await ctx.datasets.trustlines.get()
	let selectedTrustlines = trustlines.filter(trustline => trustline.currency === currency)
	let stats = {
		volume: new Decimal(0),
		marketcap: new Decimal(0),
		liquidity: new Decimal(0),
	}

	for(let trustline of selectedTrustlines){
		let enriched = await enrichTrustline(ctx, trustline)

		stats.volume = stats.volume.plus(enriched.stats.volume || 0)
		stats.marketcap = stats.marketcap.plus(enriched.stats.marketcap || 0)
		stats.liquidity = stats.liquidity.plus(enriched.stats.liquidity || 0)
	}

	return stats
}


export async function trustline(ctx){
	let currency = currencyUTF8ToHex(ctx.parameters.currency)
	let issuer = ctx.parameters.issuer
	let full = ctx.parameters.full
	let trustlines = await ctx.datasets.trustlines.get()
	let trustline = trustlines.find(trustline => trustline.currency === currency && trustline.issuer === issuer)
	
	if(!trustline){
		throw {message: 'trustline not listed', expose: true}
	}

	let enriched = await enrichTrustline(ctx, trustline)
	let formatted = await formatTrustline(ctx, enriched, !full)

	return formatted
}

export async function trustline_history(ctx){
	let currency = currencyUTF8ToHex(ctx.parameters.currency)
	let issuer = ctx.parameters.issuer
	let start = ctx.parameters.start || 0
	let end = ctx.parameters.start || unixNow()
	let historicals = ctx.datasets.historicals.get({currency, issuer})

	return historicals
}

export async function exchanges(ctx){
	let { base, quote, format, start, end } = ctx.parameters

	end = end || unixNow()
	base.currency = currencyUTF8ToHex(base.currency)
	quote.currency = currencyUTF8ToHex(quote.currency)


	if(!await ctx.repo.trustlines.has(base))
		throw {message: 'symbol not listed', expose: true}

	if(!await ctx.repo.trustlines.has(quote))
		throw {message: 'symbol not listed', expose: true}


	if(format === 'raw'){

	}else{
		if(!candlestickIntervals[format]){
			throw {
				message: `This format is not available. Available formats are: raw, ${Object.keys(candlestickIntervals).join(', ')}`, 
				expose: true
			}
		}

		let candles = await ctx.datasets.exchanges.get(base, quote, format)

		if(start && end){
			let filtered = candles
				.filter(candle => candle.t >= start && candle.t <= end)

			if(filtered.length === 0)
				return candles.slice(-1)
			else
				return filtered
		}else
			return candles
	}
}


async function enrichTrustline(ctx, trustline){
	let candles = await exchanges({
		...ctx,
		parameters: {
			base: {...trustline}, 
			quote: {currency: 'XRP'}, 
			format: '1d',
			start: unixNow() - 60*60*24*7
		}
	})
	let enriched = {...trustline}


	if(candles.length > 0){
		let lastCandle = candles[candles.length - 1]

		enriched.stats = {
			...enriched.stats,
			price: lastCandle.c,
			price_change: Math.round((lastCandle.c / lastCandle.o - 1) * 1000)/10,
			marketcap: Decimal.mul(enriched.stats.supply || 0, lastCandle.c),
			volume: Decimal.sum(...candles.map(candle => candle.v))
		}
	}

	return enriched
}

function formatTrustline(ctx, trustline, minimal){
	let formatted = {
		...trustline,
		currency: currencyHexToUTF8(trustline.currency),
		meta: {...trustline.meta}
	}

	if(minimal){
		formatted.meta.currency = collapseMetas(trustline.meta.currency, ctx.parameters.source_priority),
		formatted.meta.issuer = collapseMetas(trustline.meta.issuer, ctx.parameters.source_priority)

		delete formatted.meta.issuer.emailHash
		delete formatted.meta.issuer.socials
	}

	return formatted
}

function collapseMetas(metas, sourcePriority){
	let collapsed = {}

	for(let [key, values] of Object.entries(metas)){
		if(Array.isArray(values)){
			let meta = values[0]

			if(meta.value)
				collapsed[key] = meta.value
		}else{
			collapsed[key] = collapseMetas(values, sourcePriority)
		}
	}

	return collapsed
}